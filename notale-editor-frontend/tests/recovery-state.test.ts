import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindRecovery,recoveryState,recoveryActions} from '../src/state/recovery';
test('recovery state retains unreadable source and ignores disposed loads',async()=>{
 let resolve!: (rows:any[])=>void,late=false,imports=0;
 const source='{broken original';
 const controller=bindRecovery({retained:()=>late?new Promise(done=>resolve=done):Promise.resolve([]),journal:{list:()=>({entries:[],invalid:[{raw:source}]}),importFile:()=>imports++} as any,pending:()=>undefined,busy:()=>false,load:async()=>{},importDraft:async()=>{imports++;},copy:async()=>'',open:()=>{}});
 await controller.refresh();const row=recoveryState.getSnapshot().rows[0];assert.equal(recoveryActions.download(row.id),source);assert.equal(row.action,undefined);
 await recoveryActions.import('{"schema":"notale-sync-v1","operations":[]}');assert.equal(imports,1);
 late=true;const pending=controller.refresh(),snapshot=recoveryState.getSnapshot();controller.dispose();resolve([]);await pending;assert.equal(recoveryState.getSnapshot(),snapshot);
 await assert.rejects(recoveryActions.run(row.id),/已变化/);
});
