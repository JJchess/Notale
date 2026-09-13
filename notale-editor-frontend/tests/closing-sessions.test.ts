import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ClosingSessions} from '../src/state/closing-sessions';
test('failed closing sessions remain exportable and retries share one pending operation',async()=>{
 const registry=new ClosingSessions();let attempts=0,fail=true;
 const session={close:async()=>{attempts++;if(fail)throw Error('disk failed');},exportDraft:async()=>'{"draft":true}'};
 const id=registry.retain(session,'讲义');assert.equal(registry.retain(session,'讲义'),id);
 await registry.retry(id);assert.equal(attempts,1);assert.equal(registry.getSnapshot()[0].error,'disk failed');assert.equal(await registry.exportDraft(id),'{"draft":true}');
 fail=false;const first=registry.retry(id),second=registry.retry(id);assert.equal(first,second);await first;assert.equal(attempts,2);assert.deepEqual(registry.getSnapshot(),[]);
});
