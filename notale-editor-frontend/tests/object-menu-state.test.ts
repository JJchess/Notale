import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindObjectMenu,objectMenuState} from '../src/state/object-menu';
test('menu actions belong to the opened selection and its workbench',()=>{
 let valid=true,calls=0,focus=0;const menu=bindObjectMenu(()=>focus++);menu.open(10,20,[],[],()=>valid);const old=objectMenuState.getSnapshot();old.act!(()=>calls++);assert.equal(calls,1);menu.open(30,40,[]);old.act!(()=>calls++);assert.equal(calls,1);objectMenuState.getSnapshot().close!(true);assert.equal(focus,1);
 menu.open(10,20,[],[],()=>valid);valid=false;objectMenuState.getSnapshot().act!(()=>calls++);assert.equal(menu.opened,false);assert.equal(calls,1);menu.dispose();
});
test('toolbar refresh preserves active input and disposal cannot close a successor',()=>{
 const first=bindObjectMenu(()=>{});first.open(0,0,[]);objectMenuState.getSnapshot().toolbarFocus!(true);const controls=[{id:'size',label:'Size',kind:'number' as const,value:'12',run:()=>{}}];first.refresh(controls);assert.equal(objectMenuState.getSnapshot().controls.length,0);objectMenuState.getSnapshot().toolbarFocus!(false);first.refresh(controls);assert.equal(objectMenuState.getSnapshot().controls.length,1);const second=bindObjectMenu(()=>{});second.open(5,5,[]);first.dispose();assert.equal(second.opened,true);second.dispose();
});
