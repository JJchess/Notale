import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {describeMessage} from '@notale/editor/i18n';
import {GENERIC_LABELS} from '../src/state/ai-edits';
import {editorEnglish} from '../src/i18n/editor-messages';

/** Every fixed Chinese string the UI hands to t() must resolve in the catalog or the editor's own messages; otherwise the English
 * UI silently shows Chinese. Template holes (`${…}`) count as any value. */
const covered=(text:string)=>{const sample=text.replace(/\$\{[^}]*\}/g,'x');return !!describeMessage(sample)||!!describeMessage(sample.trim())||Object.hasOwn(editorEnglish,text);};
const cjk=/[一-鿿]/;
test('every fixed string passed to t() is in the translation catalog',()=>{
 const files:string[]=[];
 const walk=(dir:string)=>{for(const name of readdirSync(dir)){const path=join(dir,name);if(statSync(path).isDirectory())walk(path);else if(/\.tsx?$/.test(name))files.push(path);}};
 walk('src');walk('app');
 const missing=new Set<string>();
 for(const file of files)for(const match of readFileSync(file,'utf8').matchAll(/\bt\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g))
  if(cjk.test(match[2]!)&&!covered(match[2]!))missing.add(`${match[2]}  (${file})`);
 assert.deepEqual([...missing],[]);
});
test('the review list\'s own words for unnamed objects are translatable',()=>{
 assert.deepEqual([...GENERIC_LABELS].filter(label=>!covered(label)),[]);
});
