import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appearancePatch,type AppearanceObject} from '../src/state/appearance';
test('appearance patches retain HTML and SVG paint semantics and captured text size',()=>{
 const object:AppearanceObject={id:'o',tag:'div',locked:false,style:{},attributes:{}};
 const fields={'appearance-fill':'#123456','appearance-gradient':true,'appearance-gradient-angle':'90','appearance-gradient-color':'#ffffff'};
 assert.deepEqual(appearancePatch(object,'fill',fields),{'background-color':'#123456','background-image':'linear-gradient(90deg, #123456, #ffffff)'});
 assert.deepEqual(appearancePatch({...object,tag:'svg'},'fill',{...fields,'appearance-fill-none':true}),{fill:'none'});
 assert.deepEqual(appearancePatch(object,'fit',{'appearance-fit':'fixed'},{width:200.4,height:99.7}),{width:'200px',height:'100px','inline-size':'200px','block-size':'100px'});
 assert.deepEqual(appearancePatch({...object,tag:'svg'},'stroke',{'appearance-stroke-none':true}),{stroke:'none','stroke-width':'0'});
 assert.deepEqual(appearancePatch(object,'opacity',{'appearance-opacity':'50'}),{opacity:'0.5'});
});
import {appearanceFields} from '../src/state/appearance';
test('appearance fields are independent of the previous selected object',()=>{
 const object:AppearanceObject={id:'o',tag:'div',locked:false,style:{width:'max-content'},attributes:{}};
 const gradient=appearanceFields({'background-color':'rgb(1, 2, 3)','background-image':'linear-gradient(45deg, #123456, #abcdef)',opacity:'.5'},object);
 assert.equal(gradient['appearance-fill'],'#010203');assert.equal(gradient['appearance-gradient-angle'],'45');assert.equal(gradient['appearance-gradient-color'],'#abcdef');assert.equal(gradient['appearance-opacity'],'50');assert.equal(gradient['appearance-fit'],'both');
 const plain=appearanceFields({},object);assert.equal(plain['appearance-gradient'],false);assert.equal(plain['appearance-gradient-angle'],'90');assert.equal(plain['appearance-gradient-color'],'#28a69b');assert.equal(plain['appearance-opacity'],'100');
});

import {bindAppearance,appearanceState} from '../src/state/appearance-editor';
test('multi-object paint commands use each object baseline and only replace the edited field',async()=>{
 const targets:AppearanceObject[]=[{id:'a',tag:'div',locked:false,style:{'border-color':'#ff0000','border-width':'2px','border-style':'dashed','background-color':'#112233'},attributes:{}},{id:'b',tag:'div',locked:false,style:{'border-color':'#0000ff','border-width':'6px','border-style':'solid','background-color':'#abcdef'},attributes:{}}];
 const binding=bindAppearance({objects:()=>targets,selected:()=>['a','b'],key:()=> 'key',slideId:()=> 'page',documentId:()=> 'doc',capture:async()=>({computedStyles:Object.fromEntries(targets.map(o=>[o.id,o.style]))}),commands:async()=>{},preview:()=>{},commit:async()=>{},cancel:async()=>{},error:()=>{}});
 try{binding.render();await Promise.resolve();const model=appearanceState.getSnapshot()!;
 assert.ok(model.mixed.includes('appearance-stroke'));assert.ok(model.mixed.includes('appearance-stroke-width'));
 const commands=model.commands('stroke',{...model.fields,'appearance-stroke-width':'8'},'appearance-stroke-width');
 const styles=commands.map(command=>(command as any).patch.style);
 assert.deepEqual(styles,[{'border-style':'dashed','border-color':'#ff0000','border-width':'8px'},{'border-style':'solid','border-color':'#0000ff','border-width':'8px'}]);
 assert.equal(commands.some(command=>JSON.stringify(command).includes('background')),false);
 }finally{binding.disposeCapture();}
});

test('autofit replaces physical and logical sizes consistently in either writing direction',()=>{
 const object:AppearanceObject={id:'o',tag:'p',locked:false,style:{width:'600px',height:'100px','inline-size':'600px','block-size':'100px'},attributes:{}};
 assert.deepEqual(appearancePatch(object,'fit',{'appearance-fit':'both'}),{width:'max-content',height:'auto','inline-size':'max-content','block-size':'auto'});
 assert.deepEqual(appearancePatch(object,'fit',{'appearance-fit':'both','appearance-writing-mode':'vertical-rl'}),{width:'auto',height:'max-content','inline-size':'max-content','block-size':'auto'});
 assert.deepEqual(appearancePatch(object,'fit',{'appearance-fit':'fixed','appearance-writing-mode':'vertical-rl'},{width:30,height:80}),{width:'30px',height:'80px','inline-size':'80px','block-size':'30px'});
});

import {appearanceEditFields,appearanceSelection} from '../src/state/appearance';
test('untouched paint keeps alpha while native color edits deliberately replace the color',()=>{
 const object:AppearanceObject={id:'a',tag:'div',locked:false,style:{},attributes:{}};
 const css={'background-color':'rgba(255, 0, 0, 0.3)','background-image':'linear-gradient(90deg, rgba(255, 0, 0, 0.3), rgba(0, 0, 255, 0.6))','border-color':'rgba(10, 20, 30, 0.4)','border-width':'2px'};
 const fields=appearanceFields(css,object);
 const stroke=appearancePatch(object,'stroke',appearanceEditFields(fields,{'appearance-stroke-width':'8'},'appearance-stroke-width'));
 assert.equal(stroke['border-color'],'rgba(10, 20, 30, 0.4)');
 const gradient=appearancePatch(object,'gradient',appearanceEditFields(fields,{'appearance-gradient-angle':'45'},'appearance-gradient-angle'));
 assert.equal(gradient['background-image'],'linear-gradient(45deg, rgba(255, 0, 0, 0.3), rgba(0, 0, 255, 0.6))');
 assert.equal(appearancePatch(object,'stroke',appearanceEditFields(fields,{'appearance-stroke':'#abcdef'},'appearance-stroke'))['border-color'],'#abcdef');
 const selection=appearanceSelection([object,{...object,id:'b'}],{a:css,b:{...css,'border-color':'rgba(10, 20, 30, 0.8)'}});
 assert.ok(selection.mixed.includes('appearance-stroke'));
});
