import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filmContextMenu,filmMenuItems} from '../src/film/context-menu';
import {objectMenuState} from '../src/state/object-menu';

test('a film menu cannot delete a replacement selection or survive its workbench',()=>{
 const abort=new AbortController();let scope='film:clip-a',deleted=0,focused=0;
 const menu=filmContextMenu({scope:()=>scope,report:message=>assert.fail(message),signal:abort.signal});
 const rows=filmMenuItems([{id:'delete',label:'删除'}],()=>undefined,()=>deleted++);
 menu.open(1,2,rows,()=>focused++,'时间线');const old=objectMenuState.getSnapshot();
 scope='film:clip-b';old.act!(()=>old.items[0].run!(),true);
 assert.equal(deleted,0);assert.equal(objectMenuState.getSnapshot().open,false);
 menu.open(1,2,rows,()=>focused++,'时间线');scope='other-film';menu.refresh();assert.equal(objectMenuState.getSnapshot().open,false);
 menu.open(1,2,rows,()=>focused++,'时间线');const disposed=objectMenuState.getSnapshot();abort.abort();disposed.act!(()=>disposed.items[0].run!());
 assert.equal(deleted,0);assert.equal(focused,0);
});
test('command capability is checked again and focus is restored before a dialog opens',()=>{
 const abort=new AbortController(),events:string[]=[];let reason:string|undefined;
 const rows=filmMenuItems([{id:'delete',label:'删除'}],()=>reason,()=>events.push('run'));
 reason='轨道已锁定';assert.throws(()=>rows[0].run!(),/锁定/);assert.equal(events.length,0);
 reason=undefined;const menu=filmContextMenu({scope:()=>'',report:message=>assert.fail(message),signal:abort.signal});
 menu.open(0,0,rows,()=>events.push('focus'),'对象');const state=objectMenuState.getSnapshot();state.act!(()=>state.items[0].run!(),true);
 assert.deepEqual(events,['focus','run']);assert.equal(objectMenuState.getSnapshot().open,false);abort.abort();
});
