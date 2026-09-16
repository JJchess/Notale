import {test} from 'node:test';
import assert from 'node:assert/strict';
import {strToU8} from 'fflate';
import {decodeArchive,encodeArchive,NOTALE_FORMAT,notaleFilename} from '../src/server/notale-archive.js';
const fixture = () => ({...NOTALE_FORMAT,document:{schemaVersion:1,id:'test',title:'种子',slides:[{id:'page',name:'page-01',sourcePath:'page-01.html',html:'<html><head><style>:root{--leaf-green:#168854;--font-sans:Arial}</style></head><body><div id="stage"><h1 data-notale-id="stable">种子的旅行</h1><p data-deck-step="3">发芽</p><aside class="notes">讲稿</aside></div></body></html>'}],assets:{}}});
test('Notale author document round trip preserves identities, steps and semantic theme',async()=>{
 const files={'notale-project.json':strToU8(JSON.stringify(fixture())),'index.html':strToU8('<html></html>')};
 const result=await decodeArchive(await encodeArchive(files));
 assert.equal(result.document.slides[0].nativeStepCount,3);
 assert.equal(result.document.slides[0].notes,'讲稿');
 assert.equal(result.document.slides[0].name,'种子的旅行');
 assert.match(result.document.slides[0].html,/data-notale-id="stable"/);
 assert.equal(result.document.themeTokens?.['--leaf-green'],'#168854');
 assert.deepEqual(result.document.theme,{});
 const again=await decodeArchive(await encodeArchive({...files,'notale-project.json':strToU8(JSON.stringify({...NOTALE_FORMAT,document:result.document}))}));
 assert.deepEqual(again.document,result.document);
 result.document.slides[0].notes="";
 const cleared=await decodeArchive(await encodeArchive({...files,'notale-project.json':strToU8(JSON.stringify({...NOTALE_FORMAT,document:result.document}))}));
 assert.equal(cleared.document.slides[0].notes, "");
 assert.equal(notaleFilename('种子/旅行'),'种子-旅行.notale');
});
test('rejects old envelopes, unsupported versions and unsafe archive paths',async()=>{
 for(const manifest of [{document:fixture().document},{...fixture(),formatVersion:2}]) await assert.rejects(decodeArchive(await encodeArchive({'notale-project.json':strToU8(JSON.stringify(manifest)),'index.html':strToU8('')})),/Expected Notale/);
 await assert.rejects(decodeArchive(await encodeArchive({'../unsafe':strToU8('x')})));
});

test('code iframe copies retain an independent runnable source',async()=>{
 const {importHtml,inspectSlide}=await import('../src/domain/html.js');
 const {documentSchema,commitSchema}=await import('../src/domain/model.js');
 const {applyCommands}=await import('../src/domain/commands.js');
 const source=importHtml('<main id="stage"><iframe class="code-workbench-frame" data-src="assets/lesson/index.html"></iframe></main><script>Deck.onStep(function(){},2)</script>');
 assert.equal(source.nativeStepCount,2);
 assert.match(source.html,/src="assets\/lesson\/index.html"/);
 const doc=documentSchema.parse({schemaVersion:1,id:'doc',title:'Code',slides:[{id:'page',sourcePath:'page.html',...source}],assets:{}});
 const target=inspectSlide(doc.slides[0]).find(el=>el.tag==='iframe')!.id;
 const commands=commitSchema.parse({baseVersion:1,mutationId:'copy',commands:[{type:'elements.transfer',slideId:'page',sourceSlideId:'page',targets:[target],mode:'copy'}]}).commands;
 const copy=applyCommands(doc,commands),frames=inspectSlide(copy.slides[0]).filter(el=>el.tag==='iframe');
 assert.equal(frames.length,2);assert.notEqual(frames[0].id,frames[1].id);
 assert.equal(frames[0].attributes.src,frames[1].attributes.src);
});
