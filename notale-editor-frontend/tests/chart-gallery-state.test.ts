import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createChartGallery,chartGalleryState,chooseChartGallery} from '../src/state/chart-gallery';
test('late gallery completion and old disposal cannot close a replacement dialog',async()=>{
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 const first=createChartGallery();first.open({mode:'insert',choose:()=>wait});const source=chartGalleryState.getSnapshot()!;
 const choosing=chooseChartGallery(source,'bar');const second=createChartGallery();second.open({mode:'change',kind:'pie',choose:async()=>{}});const replacement=chartGalleryState.getSnapshot();
 release();await choosing;assert.equal(chartGalleryState.getSnapshot(),replacement);first.dispose();assert.equal(chartGalleryState.getSnapshot(),replacement);second.dispose();assert.equal(chartGalleryState.getSnapshot(),undefined);
});
test('gallery errors preserve the active dialog',async()=>{
 const gallery=createChartGallery();gallery.open({mode:'change',choose:async()=>{throw Error('changed');}});const source=chartGalleryState.getSnapshot()!;
 await assert.rejects(chooseChartGallery(source,'line'),/changed/);assert.equal(chartGalleryState.getSnapshot(),source);gallery.dispose();await assert.rejects(chooseChartGallery(source,'line'),/已关闭/);
});
