import {override,restore} from './vendor/openfilm-overrides.js';
import type {FilmHtmlClip} from '@notale/format/film';
/** Restores the author's frame before each sample; changes never accumulate. */
export function openFilmOverrides(win:Window){const state={win,touched:new Map(),found:[] as boolean[]};return {restore:()=>restore(state),apply:(list:FilmHtmlClip['overrides'])=>(override as (state:unknown,list:FilmHtmlClip['overrides'])=>void)(state,list??[]),missing:()=>state.found};}
