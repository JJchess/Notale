import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenFilmTransport, type OpenFilmPage, type OpenFilmHost } from '../../../notale-editor-frontend/src/film/openfilm-page.js';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
test('async page frames serialize, stale draws do not acknowledge newer seeks, repeated frames are cached', async () => {
  const draws: number[]=[], settles:number[]=[], clocks:number[]=[], errors:string[]=[];
  let finish!:()=>void;
  const page:OpenFilmPage={frame(time){draws.push(time);return new Promise<void>(resolve=>{finish=resolve;});}};
  const host:OpenFilmHost={errors:[],time:t=>clocks.push(t),settle:t=>settles.push(t)};
  const transport=new OpenFilmTransport(page,host,e=>errors.push(e));
  assert.equal(transport.prepare(1.5),false);await flush();
  assert.equal(transport.prepare(3),false);assert.deepEqual(draws,[1.5]);
  finish();await flush();assert.equal(transport.prepare(3),false);await flush();assert.deepEqual(draws,[1.5,3]);
  finish();await flush();assert.equal(transport.prepare(3),true);assert.equal(transport.prepare(3),true);
  assert.deepEqual(draws,[1.5,3]);assert.deepEqual(clocks,draws);assert.deepEqual(settles,draws);assert.deepEqual(errors,[]);transport.dispose();
});
test('page duration holds the last valid time; render failure stops once and disposal fences late failures', async () => {
  const times:number[]=[],errors:string[]=[];
  const host:OpenFilmHost={errors:[],time(){},settle(){}};
  const transport=new OpenFilmTransport({duration:2,frame:t=>{times.push(t);}},host,e=>errors.push(e));
  transport.prepare(5);await flush();assert.equal(transport.prepare(9),true);assert.ok(times[0]<2&&times[0]>1.999);transport.dispose();
  const failing=new OpenFilmTransport({frame(){throw new Error('draw failed');}},host,e=>errors.push(e));
  failing.prepare(0);await flush();assert.equal(failing.prepare(1),false);assert.deepEqual(errors,['draw failed']);failing.dispose();
  let reject!:(e:Error)=>void;
  const removed=new OpenFilmTransport({frame(){return new Promise<void>((_,no)=>{reject=no;});}},host,e=>errors.push(e));
  removed.prepare(0);await flush();removed.dispose();reject(new Error('deleted'));await flush();assert.deepEqual(errors,['draw failed']);
});
