import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {isComposingKey} from '../src/keyboard';
test('both input composition signals suppress shortcuts; ordinary keys remain eligible', () => {
 assert.equal(isComposingKey({isComposing:true,keyCode:13}),true);
 assert.equal(isComposingKey({isComposing:false,keyCode:229}),true);
 assert.equal(isComposingKey({isComposing:false,keyCode:13}),false);
 assert.equal(isComposingKey({}),false);
});
