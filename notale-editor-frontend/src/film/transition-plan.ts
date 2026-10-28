import {type FilmDocument,type FilmClip,type FilmCommand} from '@notale/editor/film';
export function transitionDurationCommands(doc:FilmDocument,clip:FilmClip,duration:number):FilmCommand[]{
 const track=doc.tracks.find(track=>track.kind==='media'&&track.clips.some(item=>item.id===clip.id));
 const left=track?.kind==='media'?track.clips.find(item=>item.at+item.duration===clip.at):undefined;
 if(!clip.transitionIn||!left||track?.locked)throw Error('此切点不能调整转场');
 return [{type:'film.transition.set',clipId:clip.id,transition:{...clip.transitionIn,duration:Math.max(1,Math.min(left.duration,clip.duration,Math.round(duration)))}}];
}
