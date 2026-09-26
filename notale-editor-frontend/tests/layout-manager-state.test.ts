import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayoutManager,layoutManagerState} from '../src/state/layout-manager';
test('master source draft survives render, rejects concurrent changes and stale callbacks',async()=>{
 const layout={id:'master',name:'Footer',html:'old',css:'',sourcePath:'layouts/master.html',theme:{},layer:'front'};
 let deck:any={id:'doc',layouts:[layout],slides:[{id:'page',layoutId:'master'}]},writes:any[]=[];
 const manager=createLayoutManager({document:()=>deck,slide:()=>deck.slides[0],commands:async commands=>{writes.push(commands);},show:async()=>{}});
 manager.render();let model=layoutManagerState.getSnapshot();model.change?.({...model.draft,html:'local'});manager.render();assert.equal(layoutManagerState.getSnapshot().draft.html,'local');
 layout.html='remote';manager.render();await layoutManagerState.getSnapshot().run?.('save');assert.equal(writes.length,0);assert.match(layoutManagerState.getSnapshot().error,/母版已更新/);
 model=layoutManagerState.getSnapshot();deck={id:'other',layouts:[],slides:[{id:'other-page'}]};manager.render();await model.run?.('apply');assert.equal(writes.length,0);manager.dispose();assert.equal(layoutManagerState.getSnapshot().run,undefined);
});
test('master checkout completion cannot navigate a newly opened document',async()=>{
 let deck:any={id:'doc',layouts:[],slides:[{id:'page'}]},release!:()=>void;const shown:string[]=[];
 const manager=createLayoutManager({document:()=>deck,slide:()=>deck.slides[0],commands:async()=>new Promise<void>(resolve=>{release=resolve;}),show:async id=>{shown.push(id);}});
 manager.render();const creating=layoutManagerState.getSnapshot().run?.('create','Lesson','title');deck={id:'other',layouts:[],slides:[{id:'other-page'}]};manager.render();release();await creating;assert.deepEqual(shown,[]);manager.dispose();
});
