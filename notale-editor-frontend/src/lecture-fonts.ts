import type {Asset,Command,DeckDocument,Slide} from '@notale/editor/browser';
import {validFilmFonts,type FilmFont} from '@notale/editor/film';
import {bindProjectFonts} from './film/project-fonts';

/** Lecture mounting precedes its initial snapshot; do not invoke document getters early. */
export function bindLectureFonts(ready:()=>boolean,binding:Parameters<typeof bindProjectFonts>[0]){
 let fonts:ReturnType<typeof bindProjectFonts>|undefined,disposed=false;
 function update(){if(disposed)return;if(!ready()){fonts?.dispose();fonts=undefined;return;}fonts??=bindProjectFonts(binding);fonts.update();}
 update();
 return {update,dispose(){disposed=true;fonts?.dispose();fonts=undefined;}};
}

const extensions={woff2:'woff2',woff:'woff',truetype:'ttf',opentype:'otf'};
export const lectureFontPath=(font:FilmFont)=>`assets/fonts/notale-${font.hash}.${extensions[font.format]}`;
export const lectureFontMime=(font:FilmFont)=>({woff2:'font/woff2',woff:'font/woff',truetype:'font/ttf',opentype:'font/otf'})[font.format];
/** Font declarations are ordinary authored CSS; the binary is an existing Deck asset. */
function declaredFonts(slide:Pick<Slide,'html'>):FilmFont[]{
 const result:FilmFont[]=[];
 for(const match of slide.html.matchAll(/<style\b[^>]*\bdata-notale-project-font\s*=\s*(["'])(.*?)\1[^>]*>/gi))try{const font=JSON.parse(decodeURIComponent(match[2]));if(validFilmFonts([font])&&font.uri===lectureFontPath(font))result.push(font);}catch{/* Unrelated or edited author markup is not a project font declaration. */}
 return result;
}
export function lectureProjectFonts(document:DeckDocument,assetBase:string):FilmFont[]{
 if(!assetBase)return [];
 const fonts=new Map<string,FilmFont>();
 for(const slide of document.slides)for(const font of declaredFonts(slide))if(document.assets[font.uri]?.hash===font.hash)fonts.set(font.hash,{...font,uri:new URL(font.uri,assetBase).href});
 return [...fonts.values()];
}
export function lectureFontCommands(document:DeckDocument,slideId:string,font:FilmFont,asset:Asset,styles:Command[]):Command[]{
 if(!validFilmFonts([font])||asset.hash!==font.hash)throw Error('字体文件与声明不符');
 const slide=document.slides.find(slide=>slide.id===slideId);if(!slide)throw Error('页面已切换，请重新选择字体');
 if(!styles.length||styles.some(command=>command.type!=='element.patch'||command.slideId!==slideId||!command.patch.style))throw Error('请选择可编辑的文字');
 const path=lectureFontPath(font),existing=document.assets[path];if(existing&&existing.hash!==font.hash)throw Error('字体资源路径冲突');
 const commands:Command[]=existing?[]:[{type:'asset.put',path,asset}];
 if(!declaredFonts(slide).some(item=>item.hash===font.hash&&item.family===font.family)){
  const metadata=encodeURIComponent(JSON.stringify({...font,uri:path})).replaceAll("'",'%27');
  const quote=(text:string)=>JSON.stringify(text).replaceAll('<','\\3c ');
  const uri='../'.repeat(slide.sourcePath.split('/').length-1)+path;
  const css=`@font-face{font-family:${quote(font.family)};src:url(${quote(uri)}) format(${quote(font.format)});font-weight:${font.weight??'400'};font-style:${font.style??'normal'};font-display:block;}`;
  commands.push({type:'element.insert',slideId,html:`<style data-notale-project-font="${metadata}">${css}</style>`});
 }
 return [...commands,...styles];
}
