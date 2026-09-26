import {test} from 'node:test';
import assert from 'node:assert/strict';
import {themeCommand} from '../src/state/theme-panel';
test('theme patches preserve unrelated remote values and reject conflicts',()=>{
 const source={key:'doc',value:'{}',theme:{'--bg':'#ffffff','font-family':'Arial'}};
 const doc={id:'doc',theme:{...source.theme,'--accent':'blue'}};
 const result=themeCommand(doc as any,source,{'font-family':'','--bg':'#111111'}) as any;
 assert.deepEqual(result.theme,{'--bg':'#111111','--accent':'blue'});
 doc.theme['--bg']='#222222';assert.throws(()=>themeCommand(doc as any,source,{'--bg':'#111111'}),/主题已变化/);
 assert.throws(()=>themeCommand({...doc,id:'other'} as any,source,{}),/讲义已切换/);
});
