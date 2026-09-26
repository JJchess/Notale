import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerThumbnailHost,observeThumbnailHosts} from '../src/canvas/thumbnail-hosts';
test('hosts replay to a new controller and detached controllers receive no updates',()=>{
 const host={element:{} as HTMLElement,documentId:'doc',pageId:'page'};
 const unregister=registerThumbnailHost(host),first:boolean[]=[],second:boolean[]=[];
 const stopFirst=observeThumbnailHosts((value,mounted)=>{assert.equal(value,host);first.push(mounted);});
 stopFirst();const stopSecond=observeThumbnailHosts((value,mounted)=>{assert.equal(value,host);second.push(mounted);});
 unregister();unregister();stopSecond();assert.deepEqual(first,[true]);assert.deepEqual(second,[true,false]);
 const remaining:unknown[]=[];const stop=observeThumbnailHosts(host=>remaining.push(host));stop();assert.deepEqual(remaining,[]);
});
