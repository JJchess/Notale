import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindSaveRecovery,saveRecoveryState} from '../src/state/save-recovery-actions';
test('save recovery ignores old scopes and still allows draft export during a retry',async()=>{
 let scope='doc',release!:()=>void,reloads=0,exports=0;
 const binding=bindSaveRecovery({scope:()=>scope,retry:async()=>new Promise<void>(resolve=>{release=resolve;}),reload:async()=>{reloads++;},export:async()=>{exports++;}});
 binding.update({scope,visible:true,busy:false});const source=saveRecoveryState.getSnapshot(),retry=source.run?.('retry');await source.run?.('reload');assert.equal(reloads,0);await source.run?.('export');assert.equal(exports,1);release();await retry;
 scope='other';await source.run?.('reload');assert.equal(reloads,0);binding.dispose();assert.equal(saveRecoveryState.getSnapshot().run,undefined);
});
