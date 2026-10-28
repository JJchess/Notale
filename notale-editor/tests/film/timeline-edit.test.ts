import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyFilm,parseFilmDocument,type FilmClip,type FilmDocument,type FilmMediaTrack,type FilmSubtitleTrack} from '../../../notale-format/src/film.js';
import {planFilmTimeline,type FilmTimelineEdit,type FilmTimelinePreferences,mainFilmTrack} from '../../src/film/timeline-edit.js';
import {applyFilmCommands} from '../../src/film/commands.js';
import {clipSourceTime} from '../../src/film/timing.js';
import {readTimelinePreferences,writeTimelinePreferences} from '../../../notale-editor-frontend/src/film/timeline-preferences.js';

const main:FilmTimelinePreferences={magnet:true,follow:'main',linkage:true};
const current:FilmTimelinePreferences={magnet:false,follow:'current',linkage:true};
const clips=(doc:FilmDocument,id='v1')=>(doc.tracks.find(t=>t.id===id) as FilmMediaTrack).clips;
const clip=(doc:FilmDocument,id:string)=>doc.tracks.flatMap(t=>t.kind==='media'?t.clips:[]).find(c=>c.id===id)!;
function fixture():FilmDocument {
 const doc=emptyFilm('timeline-planner');doc.sources=[{id:'v',title:'Video',kind:'video',uri:'/v.mp4',duration:100},{id:'audio-source',title:'Audio',kind:'audio',uri:'/v.mp4',duration:100},{id:'title',title:'Title',kind:'image',uri:'/title.png'}];
 clips(doc).push(...['a','b','c'].map((id,i):FilmClip=>({id,title:id,sourceId:'v',at:i*90,duration:90,in:10+i*5,linkGroup:'link-'+id})));
 doc.tracks.push({id:'audio',title:'Audio',kind:'media',locked:false,hidden:false,muted:false,clips:clips(doc).map(c=>({...c,id:c.id+'-audio',sourceId:'audio-source',in:c.in+20}))});
 doc.markers=[{id:'marker',title:'Marker',at:135}];return parseFilmDocument(doc);
}
function withFollowers(){const doc=fixture();doc.tracks.unshift({id:'titles',title:'Titles',kind:'media',locked:false,hidden:false,muted:false,clips:[{id:'title-a',title:'A title',sourceId:'title',at:10,duration:20,in:0},{id:'title-b',title:'B title',sourceId:'title',at:100,duration:20,in:0}]});doc.tracks.push({id:'music',title:'Music',kind:'media',locked:false,hidden:false,muted:false,clips:[{id:'bed',title:'Bed',sourceId:'audio-source',at:0,duration:270,in:0}]});return parseFilmDocument(doc);}

test('main magnet moves an AV group and its title once while music stays on film time',()=>{
 const doc=withFollowers(),before=structuredClone(doc);assert.equal(mainFilmTrack(doc)?.id,'v1');
 const plan=planFilmTimeline(doc,{type:'move',ids:['a'],delta:270},main);
 assert.deepEqual(clips(plan.document).map(c=>[c.id,c.at]),[['b',0],['c',90],['a',180]]);
 assert.equal(clip(plan.document,'a-audio').at,180);assert.equal(clip(plan.document,'b-audio').at,0);
 assert.equal(clip(plan.document,'title-a').at,190);assert.equal(clip(plan.document,'title-b').at,10);assert.equal(clip(plan.document,'bed').at,0);
 assert.equal(plan.commands.length,1);assert.deepEqual(applyFilmCommands(doc,plan.commands),plan.document);assert.deepEqual(doc,before);
 const changed=structuredClone(doc);changed.title='New revision';assert.throws(()=>applyFilmCommands(changed,plan.commands),/修订/);
 assert.deepEqual(applyFilmCommands(plan.document,[{type:'film.document.restore',document:doc,expected:plan.document}]),doc);
});
test('global ripple deletion merges coincident AV intervals and moves markers only once',()=>{
 const doc=fixture();doc.tracks.push({id:'sub',title:'Caption',kind:'subtitle',language:'zh',locked:false,hidden:false,muted:false,cues:[{id:'cue',at:100,duration:20,text:'Caption'}]});
 const plan=planFilmTimeline(doc,{type:'remove',ids:['a'],ripple:true},{...current,follow:'all'});
 assert.equal(clip(plan.document,'b').at,0);assert.equal(clip(plan.document,'b-audio').at,0);assert.equal(plan.document.markers[0].at,45);
 assert.equal((plan.document.tracks.at(-1) as FilmSubtitleTrack).cues[0].at,10);
 const linked=planFilmTimeline(withFollowers(),{type:'remove',ids:['a']},main).document;
 assert.equal(clip(linked,'title-a'),undefined);assert.equal(clip(linked,'title-b').at,10);assert.equal(clip(linked,'bed').at,0);
});
test('cross-track groups retain row/time offsets; disabling linkage really permits an individual edit',()=>{
 const doc=fixture();doc.tracks.unshift({id:'upper',title:'Upper',kind:'media',locked:false,hidden:false,muted:false,clips:[]});
 const moved=planFilmTimeline(doc,{type:'move',ids:['a'],delta:0,destination:'upper'},current).document;
 assert.equal(clips(moved,'upper')[0].id,'a');assert.ok(clips(moved).some(c=>c.id==='a-audio'));
 assert.throws(()=>planFilmTimeline(doc,{type:'move',ids:['a'],delta:0,destination:'audio'},current),/目标轨道/);
 const single=planFilmTimeline(doc,{type:'slip',clipId:'a',delta:30},{...current,linkage:false}).document;
 assert.equal(clip(single,'a').in,11);assert.equal(clip(single,'a-audio').in,30);assert.equal(clip(single,'a').linkGroup,'link-a');
 const alone=planFilmTimeline(fixture(),{type:'move',ids:['a'],delta:270},{...main,linkage:false}).document;
 assert.equal(clip(alone,'a').at,180);assert.equal(clip(alone,'a-audio').at,0);assert.equal(clip(alone,'b-audio').at,90);
});
test('trim, roll and slide retain matching audio cuts and never ripple unrelated markers',()=>{
 const doc=fixture();const trim=planFilmTimeline(doc,{type:'trim',clipId:'a',edge:'in',delta:15},main).document;
 assert.equal(clip(trim,'a').at,0);assert.equal(clip(trim,'a').duration,75);assert.equal(clip(trim,'a-audio').in,30.5);assert.equal(clip(trim,'b-audio').at,75);
 const rolled=planFilmTimeline(doc,{type:'roll',leftId:'a',rightId:'b',delta:10},main).document;
 assert.equal(clip(rolled,'a-audio').duration,100);assert.equal(clip(rolled,'b-audio').at,100);assert.equal(rolled.markers[0].at,135);
 const slide=planFilmTimeline(doc,{type:'slide',clipId:'b',delta:10},main).document;
 assert.equal(clip(slide,'b-audio').at,100);assert.equal(clip(slide,'c-audio').at,190);assert.equal(clip(slide,'a-audio').duration,100);assert.equal(slide.markers[0].at,135);
});
test('locked members, crossing groups and final overlaps reject atomically',()=>{
 const locked=fixture();locked.tracks[1].locked=true;const copy=structuredClone(locked);
 const edits:FilmTimelineEdit[]=[{type:'move',ids:['a'],delta:10},{type:'remove',ids:['a']},{type:'trim',clipId:'a',edge:'out',delta:10}];
 for(const edit of edits)assert.throws(()=>planFilmTimeline(locked,edit,main),/锁定/);
 assert.deepEqual(locked,copy);
 const crossing=fixture();clip(crossing,'b-audio').at=100;clip(crossing,'b-audio').duration=80;
 assert.throws(()=>planFilmTimeline(crossing,{type:'trim',clipId:'b',edge:'out',delta:-10},main),/边界不同/);
 assert.throws(()=>planFilmTimeline(withFollowers(),{type:'remove',ids:['a'],ripple:true},{...current,follow:'all'}),/未拆分/);
 assert.throws(()=>planFilmTimeline(fixture(),{type:'move',ids:['a'],delta:30},current),/overlap/);
});
test('split and duplicate allocate independent link groups and preserve source seconds and author clocks',()=>{
 const doc=fixture();doc.sources[0].kind='motale';doc.sources[0].uri='/scene/index.html';
 clip(doc,'a').motale={schema:'motale-author/0',acts:{intro:{objects:{title:{x:{keys:[[10,1],[12,2]]}}}}}};
 clip(doc,'a').appearance={keyframes:{x:[{frame:0,value:0},{frame:90,value:90}]}};
 const plan=planFilmTimeline(doc,{type:'split',ids:['a'],at:45,idPrefix:'split'},current),rights=plan.selectedIds.filter(id=>!['a','a-audio'].includes(id));
 assert.equal(rights.length,2);const [picture,sound]=rights.map(id=>clip(plan.document,id));
 assert.equal(picture.linkGroup,sound.linkGroup);assert.notEqual(picture.linkGroup,'link-a');assert.equal(picture.in,11.5);assert.equal(picture.animationOffset,45);assert.deepEqual(picture.motale,clip(doc,'a').motale);
 const duplicated=planFilmTimeline(doc,{type:'duplicate',ids:['a'],at:270,idPrefix:'copy'},current);
 const copies=duplicated.selectedIds.map(id=>clip(duplicated.document,id));assert.equal(copies.length,2);assert.equal(copies[0].linkGroup,copies[1].linkGroup);assert.notEqual(copies[0].linkGroup,'link-a');
 const inserted=planFilmTimeline(fixture(),{type:'duplicate',ids:['a'],at:90,idPrefix:'insert-copy'},main);
 assert.equal(clip(inserted.document,'b').at,180);assert.equal(clip(inserted.document,'b-audio').at,180);assert.equal(clip(inserted.document,inserted.selectedIds[0]).at,90);
});
test('timing applies each linked source origin, and follows the chosen ripple scope',()=>{
 const doc=fixture(),plan=planFilmTimeline(doc,{type:'timing',clipId:'a',timing:{rate:2},sourceIn:10,duration:45},main);
 assert.equal(clip(plan.document,'a-audio').in,30);assert.equal(clip(plan.document,'b-audio').at,45);
 const reverse=planFilmTimeline(doc,{type:'timing',clipId:'a',timing:{rate:-1},mode:'reverse'},current).document;
 assert.equal(clipSourceTime(clip(reverse,'a-audio'),0,doc.frameRate),clipSourceTime(clip(doc,'a-audio'),89,doc.frameRate));
 const freeze=planFilmTimeline(doc,{type:'timing',clipId:'a',timing:{rate:0},mode:'freeze',localFrame:30},current).document;
 assert.equal(clip(freeze,'a').in,11);assert.equal(clip(freeze,'a-audio').in,31);
});
test('new-document preferences persist while existing sync/link selection remain unchanged',()=>{
 const saved=new Map<string,string>(),store={getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>{saved.set(key,value);}};
 assert.deepEqual(readTimelinePreferences('new',{newProject:true},store),main);
 assert.deepEqual(readTimelinePreferences('new',{},store),main);
 assert.deepEqual(readTimelinePreferences('old',{legacySync:true,legacyLinkage:false},store),{magnet:false,follow:'all',linkage:false});
 writeTimelinePreferences('new',{...main,mainTrackId:'upper',follow:'current'},store);
 assert.equal(readTimelinePreferences('new',{},store).mainTrackId,'upper');assert.equal(readTimelinePreferences('old',{},store).follow,'all');
});
test('placement carries linked timing and restores source-caption projection for new remnants',()=>{
 const doc=fixture();doc.sources[0].captions=[{id:'source-caption',title:'Speech',language:'zh',cues:[{start:0,end:100,text:'Speech'}]}];
 const inserted=planFilmTimeline(doc,{type:'place',trackId:'v1',clip:{id:'new',sourceId:'v',title:'New',at:90,duration:30,in:0},mode:'magnet',idPrefix:'place'},main).document;
 assert.equal(clip(inserted,'b').at,120);assert.equal(clip(inserted,'b-audio').at,120);assert.ok(inserted.tracks.some(t=>t.kind==='subtitle'&&t.sourceClipId==='new'));
 const overwritten=planFilmTimeline(doc,{type:'place',trackId:'v1',clip:{id:'new',sourceId:'v',title:'New',at:30,duration:30,in:0},mode:'overwrite',idPrefix:'replace'},{...current,linkage:false}).document;
 const right=clips(overwritten).find(c=>c.at===60)!;assert.equal(right.in,12);assert.ok(overwritten.tracks.some(t=>t.kind==='subtitle'&&t.sourceClipId===right.id));
});
