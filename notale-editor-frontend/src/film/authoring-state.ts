import type {FilmEasing} from '@notale/editor/film';
export interface FilmAuthoringOrigin {scope:string;property:string;frame:number;revision?:string;}
export interface FilmAuthoringProperty {name:string;label:string;value:string|number;animated:boolean;keyed:boolean;kind?:'number'|'enum'|'css';group?:string;min?:number;max?:number;options?:readonly string[];}
export interface FilmAuthoringModel extends FilmAuthoringOrigin {properties:FilmAuthoringProperty[];disabled:boolean;error?:string;keys?:{frame:number;value:string|number}[];customProperties?:boolean;reading?:boolean;currentEasing?:FilmEasing;easingEditable?:boolean;}
const initial:FilmAuthoringModel={scope:'',properties:[],property:'opacity',frame:0,disabled:true};
let model=initial,owner:symbol|undefined;
const listeners=new Set<()=>void>();
function publish(next:FilmAuthoringModel){model=next;for(const listener of listeners)listener();}
export const filmAuthoringState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export const filmAuthoringActions={selectProperty:(_property:string)=>{},preview:(_value:string|number,_origin:FilmAuthoringOrigin)=>{},cancelPreview:()=>{},commit:async(_value:string|number,_origin?:FilmAuthoringOrigin)=>{},toggleKey:async(_origin?:FilmAuthoringOrigin)=>{},removeKey:async(_origin?:FilmAuthoringOrigin)=>{},easing:async(_value:FilmEasing,_origin?:FilmAuthoringOrigin)=>{},resetBase:async(_origin?:FilmAuthoringOrigin)=>{},seek:(_frame:number)=>{}};
export function bindFilmAuthoringState(actions:typeof filmAuthoringActions){
 const token=Symbol();owner=token;
 for(const name of Object.keys(actions) as (keyof typeof actions)[])Reflect.set(filmAuthoringActions,name,(...args:unknown[])=>{if(owner!==token)throw Error('编辑选区已关闭');return Reflect.apply(actions[name],actions,args);});
 publish(initial);
 return {update(next:FilmAuthoringModel){if(owner===token)publish(next);},dispose(){if(owner===token){owner=undefined;publish(initial);}}};
}
