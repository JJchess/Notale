import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatScopes,resolveFormatTab,formatView} from '../src/state/format-tabs';
const ids=(scopes:ReturnType<typeof formatScopes>)=>scopes.map(scope=>[scope.id,scope.tabs.map(tab=>tab.id)]);
test('a shape offers the three object facets and no type-specific tab',()=>{
 assert.deepEqual(ids(formatScopes(true,'shape',false)),[['object',['fill','effects','layout']]]);
});
test('only the selected type contributes the fourth tab',()=>{
 const special=(kind:Parameters<typeof formatScopes>[1])=>formatScopes(true,kind,false)[0].tabs.at(-1);
 assert.equal(special('image')?.label,'图片');
 assert.equal(special('table')?.label,'表格');
 assert.equal(special('equation')?.label,'公式');
 assert.equal(special('shape')?.id,'layout');
 assert.equal(special('object')?.id,'layout');
});
test('connectors and interactive objects are not in the object list but still get their tab',()=>{
 assert.equal(formatScopes(true,'none',false,{connector:true})[0].tabs.at(-1)?.label,'连接线');
 assert.equal(formatScopes(true,'none',false,{interactive:true})[0].tabs.at(-1)?.label,'互动');
 assert.equal(formatScopes(true,'none',false)[0].tabs.at(-1)?.id,'layout');
});
test('the text scope appears only when the selection carries typography',()=>{
 assert.deepEqual(formatScopes(true,'text',false).map(scope=>scope.id),['object']);
 assert.deepEqual(formatScopes(true,'text',true).map(scope=>scope.id),['object','text']);
 assert.deepEqual(formatScopes(true,'text',true)[1].tabs.map(tab=>tab.id),['font','textbox']);
});
test('no selection shows the page scope instead of the object one',()=>{
 assert.deepEqual(ids(formatScopes(false,'none',false)),[['page',['background','theme','page']]]);
});
test('the chosen facet survives a new selection that still has it',()=>{
 const scopes=formatScopes(true,'image',false);
 assert.deepEqual(resolveFormatTab(scopes,'object','effects'),{scope:'object',tab:'effects'});
});
test('a facet the new selection lacks falls back to the first tab of that scope',()=>{
 assert.deepEqual(resolveFormatTab(formatScopes(true,'shape',false),'object','special'),{scope:'object',tab:'fill'});
 assert.deepEqual(resolveFormatTab(formatScopes(true,'shape',false),'text','font'),{scope:'object',tab:'fill'});
 assert.deepEqual(resolveFormatTab(formatScopes(false,'none',false),'object','fill'),{scope:'page',tab:'background'});
});
test('the view reports the scopes and the resolved tab together',()=>{
 const view=formatView(true,'chart',true,'text','textbox');
 assert.deepEqual(view.scopes.map(scope=>scope.id),['object','text']);
 assert.deepEqual([view.scope,view.tab],['text','textbox']);
 assert.equal(view.scopes[0].label,'图表选项');
});
