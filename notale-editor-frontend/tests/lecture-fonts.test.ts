import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentSchema} from '../../notale-editor/src/domain/model';
import {applyCommands} from '../../notale-editor/src/domain/commands';
import type {Command} from '@notale/editor/browser';
import type {FilmFont} from '@notale/editor/film';
import {bindLectureFonts,lectureFontCommands,lectureFontPath,lectureProjectFonts} from '../src/lecture-fonts';
import {projectFontsState} from '../src/film/project-fonts';

const font:FilmFont={id:'test-font',family:'Project Font',displayName:'Imported Font',uri:'/film-media/fonts/test.woff2',hash:'a'.repeat(64),format:'woff2',weight:'100 900'};
const asset={hash:font.hash,mime:'font/woff2',size:123};
const document=()=>documentSchema.parse({schemaVersion:1,id:'lecture',title:'Lecture',slides:[{id:'page',name:'Page',sourcePath:'pages/chapter/page.html',html:'<!doctype html><html><head></head><body><main id="stage" data-notale-id="stage"><p data-notale-id="text">Keep my content</p></main></body></html>'}]});
const styles:Command[]=[{type:'element.patch',slideId:'page',target:'text',patch:{style:{'font-family':font.family}}}];
test('lecture fonts wait for the first snapshot and clear their binding when that snapshot disappears',()=>{
 let snapshot:ReturnType<typeof document>|undefined,reads=0;
 const binding=bindLectureFonts(()=>!!snapshot,{scope:()=>{reads++;return snapshot!.id;},getFonts:()=>lectureProjectFonts(snapshot!,'https://preview.example/'),apply:async()=>{}});
 try{
  binding.update();assert.equal(reads,0);assert.equal(projectFontsState.getSnapshot(),undefined);
  snapshot=document();binding.update();assert.equal(projectFontsState.getSnapshot()?.scope,'lecture');assert.ok(reads>0);
  snapshot=undefined;binding.update();assert.equal(projectFontsState.getSnapshot(),undefined);
  binding.dispose();snapshot=document();binding.update();assert.equal(projectFontsState.getSnapshot(),undefined);
 }finally{binding.dispose();}
});
test('lecture font asset, declaration and typography survive a core command roundtrip and reuse across pages',()=>{
 const initial=document(),commands=lectureFontCommands(initial,'page',font,asset,styles);
 assert.deepEqual(commands.map(command=>command.type),['asset.put','element.insert','element.patch']);
 const saved=applyCommands(initial,commands);
 assert.equal(Object.keys(initial.assets).length,0);assert.ok(saved.slides[0].html.includes('Keep my content'));
 assert.ok(saved.slides[0].html.includes('../../'+lectureFontPath(font)));
 assert.equal(saved.assets[lectureFontPath(font)].hash,font.hash);
 const reopened=documentSchema.parse(JSON.parse(JSON.stringify(saved)));
 const fonts=lectureProjectFonts(reopened,'https://preview.example/deck/');
 assert.equal(fonts.length,1);assert.equal(fonts[0].uri,'https://preview.example/deck/'+lectureFontPath(font));assert.equal(fonts[0].weight,'100 900');
 assert.deepEqual(lectureFontCommands(reopened,'page',fonts[0],asset,styles),styles);
 const next=applyCommands(reopened,[{type:'slide.insert',after:'page',slide:{...reopened.slides[0],id:'next',sourcePath:'next.html',html:'<html><head></head><body><p data-notale-id="next-text">Next</p></body></html>'}}]);
 const edits:Command[]=[{type:'element.patch',slideId:'next',target:'next-text',patch:{style:{'font-family':font.family}}}];
 const reused=lectureFontCommands(next,'next',fonts[0],asset,edits);assert.deepEqual(reused.map(command=>command.type),['element.insert','element.patch']);
 assert.ok((reused[0] as Extract<Command,{type:'element.insert'}>).html.includes('url("'+lectureFontPath(font)+'")'));
});
test('font application rejects mismatched bytes and ignores stale or malformed persisted declarations',()=>{
 const initial=document();assert.throws(()=>lectureFontCommands(initial,'page',font,{...asset,hash:'b'.repeat(64)},styles),/声明不符/);
 assert.throws(()=>lectureFontCommands(initial,'missing',font,asset,styles),/页面已切换/);
 const saved=applyCommands(initial,lectureFontCommands(initial,'page',font,asset,styles));delete saved.assets[lectureFontPath(font)];
 assert.deepEqual(lectureProjectFonts(saved,'https://preview.example/'),[]);
 saved.slides[0].html+='<style data-notale-project-font="%invalid">p{color:red}</style>';
 assert.deepEqual(lectureProjectFonts(saved,'https://preview.example/'),[]);
});
