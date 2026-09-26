import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChartGridConnection,chartGridState} from '../src/state/chart-grid-connection';
test('replaced grid connections reject pending mounts and release late adapters',async()=>{
 const container={} as HTMLElement,first=createChartGridConnection(),pending=first.mount(container),source=chartGridState.getSnapshot()!;
 const rejected=assert.rejects(pending,/替换/),second=createChartGridConnection(),next=second.mount(container);await rejected;
 let disposed=0;source.ready({adapter:{dispose:()=>{disposed++;}} as any,element:container});assert.equal(disposed,1);
 const current=chartGridState.getSnapshot()!;const handle={adapter:{dispose:()=>{}} as any,element:container};current.ready(handle);assert.equal(await next,handle);first.dispose();assert.equal(chartGridState.getSnapshot(),current);second.dispose();assert.equal(chartGridState.getSnapshot(),undefined);
});
