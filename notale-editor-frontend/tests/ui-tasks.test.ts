import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {UiTasks} from '../src/lifecycle/ui-tasks';
test('workbench exit cancels pending interface callbacks and refuses new ones',async()=>{
 const abort=new AbortController(),tasks=new UiTasks(abort.signal);let calls=0;
 tasks.schedule(()=>calls++,10);abort.abort();tasks.schedule(()=>calls++,0);await wait(20);assert.equal(calls,0);
 const live=new UiTasks(new AbortController().signal),cancel=live.schedule(()=>calls++,5);cancel();live.schedule(()=>calls++,0);await wait(15);assert.equal(calls,1);live.dispose();live.dispose();
});
