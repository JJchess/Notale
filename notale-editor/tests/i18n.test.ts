import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {english,resolveLocale,formatMessage,translateMessage,describeMessage} from '../src/i18n/index.js';
import {documentSchema} from '../src/domain/model.js';
import {playerHtml} from '../src/server/render.js';

test('saved language wins; browser language priorities and fallback are stable',()=>{
 assert.equal(resolveLocale('zh-CN','en-US'),'zh-CN');
 assert.equal(resolveLocale(undefined,'fr-FR,zh-TW;q=0.8,en;q=0.5'),'zh-CN');
 assert.equal(resolveLocale('invalid',['en-GB','zh-CN']),'en-US');
 assert.equal(resolveLocale(undefined,'zh;q=0,en;q=0.9'),'en-US');
 assert.equal(resolveLocale(undefined,'de-DE'),'en-US');
});
test('every translation retains all parameters; interpolated authored text stays literal',()=>{
 const params=(value:string)=>[...value.matchAll(/\{(\d+)\}/g)].map(match=>match[1]).sort();
 for(const [key,value]of Object.entries(english)){assert.ok(value.trim(),key);assert.deepEqual(params(key),params(value),key);}
 assert.equal(formatMessage('en-US','{0} 的改动',{'0':'保存 <img> 1 objects {1}'}),'Changes to 保存 <img> 1 objects {1}');
 assert.equal(translateMessage('en-US','我的讲义内容'), '我的讲义内容');
 assert.equal(translateMessage('en-US','已选择 1 个对象'),'1 object selected');
 const descriptor=describeMessage('引用 保存');assert.ok(descriptor);
 assert.equal(formatMessage('en-US',descriptor.messageKey,descriptor.messageParams),'Reference 保存');
});
test('export player fixes UI language without changing authored titles, notes or slide data',()=>{
 const doc=documentSchema.parse({schemaVersion:1,id:randomUUID(),title:'保存 <script>',slides:[{id:'page',name:'开始',sourcePath:'page.html',notes:'保存',html:'<html><body>中文内容</body></html>'}]});
 const before=JSON.stringify(doc),en=playerHtml(doc,'en-US'),zh=playerHtml(doc,'zh-CN');
 assert.match(en,/<html lang="en-US">/);assert.match(en,/>Pause autoplay</);assert.match(en,/>Notes</);assert.doesNotMatch(en,/>暂停自动播放</);
 assert.match(zh,/<html lang="zh-CN">/);assert.match(zh,/>暂停自动播放</);
 assert.match(en,/"name":"开始"/);assert.match(en,/"notes":"保存"/);assert.match(en,/<title>保存 &lt;script&gt;<\/title>/);
 assert.equal(JSON.stringify(doc),before);
});
