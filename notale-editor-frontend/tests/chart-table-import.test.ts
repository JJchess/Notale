import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newChart} from '@notale/editor/browser';
import {importChartTable,chartNumber} from '../src/state/chart-table-import';
test('table import retains stable identities and styles without mutating the source',()=>{
 const source=newChart('line'),before=structuredClone(source);
 const next=importChartTable(source,'分类,训练,验证\nA,1.5,\nB,-2,3e2');
 assert.deepEqual(source,before);assert.equal(next.columns[0].id,source.columns[0].id);assert.equal(next.rows[0].id,source.rows[0].id);assert.equal(next.series[0].id,source.series[0].id);
 assert.equal(next.rows[0].values[next.columns[1].id],1.5);assert.equal(next.rows[0].values[next.columns[2].id],null);assert.equal(next.rows[1].values[next.columns[2].id],300);
 assert.throws(()=>importChartTable(source,'分类,训练\nA,wrong'),/第 1 行/);assert.deepEqual(source,before);
 assert.throws(()=>chartNumber('Infinity',0,'值'),/需要数字/);
 const noHeader=importChartTable(source,'A\t2\nB\t3',false);assert.equal(noHeader.rows.length,2);assert.equal(noHeader.series[0].name,'系列 1');
});
