import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clipProperties,propertyMetadata,validEasing,easingPresets} from '../src/film/authoring-properties';
import {clipAppearance,clipObjects,type FilmClip} from '@notale/editor/film';
import {clipStyleCommand} from '../src/film/authoring-animation';
test('all film properties expose typed controls, and easing accepts overshoot only in Y',()=>{
 assert.equal(new Set(clipProperties).size,22);assert.ok(clipProperties.includes('skewX'));
 assert.deepEqual(propertyMetadata('opacity',false),{group:'外观',kind:'number',min:0,max:1});assert.deepEqual(propertyMetadata('fit',false).options,['contain','cover','fill']);
 assert.equal(propertyMetadata('--progress',true).kind,'css');assert.ok(validEasing([.2,-.4,.8,1.3]));assert.equal(validEasing([-.1,0,.8,1]),false);assert.equal(validEasing([.2,0,1.1,1]),false);assert.equal(validEasing([.2,NaN,.8,1]),false);
});
test('trimmed current-frame edits preserve authored clocks, future keys and the existing easing',()=>{
 const clip:FilmClip={id:'clip',sourceId:'source',title:'Clip',at:100,in:0,duration:60,animationOffset:30,appearance:{values:{opacity:.4},keyframes:{opacity:[{frame:30,value:0,easing:easingPresets['ease-in']},{frame:90,value:1}]}},objects:{text:{keyframes:{'--progress':[{frame:30,value:'0'},{frame:90,value:'100'}]}}}};
 const existing=clipStyleCommand(clip,100,'opacity',.2);assert.equal(existing.type,'film.keyframe.put');if(existing.type==='film.keyframe.put'){assert.equal(existing.keyframe.frame,30);assert.deepEqual(existing.keyframe.easing,easingPresets['ease-in']);}
 const between=clipStyleCommand(clip,130,'opacity',.7);assert.equal(between.type,'film.keyframe.put');if(between.type==='film.keyframe.put')assert.equal(between.keyframe.frame,60);
 const plain=clipStyleCommand(clip,130,'blur',4);assert.equal(plain.type,'film.property.set');assert.equal(clip.appearance?.keyframes?.opacity?.[1].frame,90);
 assert.equal(clipObjects(clip,30).text['--progress'],'50');assert.equal(clipAppearance(clip,0).opacity,0);
});
