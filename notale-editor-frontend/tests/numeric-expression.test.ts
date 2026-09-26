import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundedNumber,numericExpression} from '../src/state/numeric-expression';
test('numeric fields evaluate arithmetic with precedence, unary values and finite decimals',()=>{
 for(const [input,expected] of [['1600/2',800],['(120+40)*2',320],['-5+2*3',1],['.1+.2',.3],['2e2 / 4',50],['5--2',7]] as const)assert.equal(numericExpression(input),expected);
});
test('numeric fields reject unsafe, incomplete and out-of-range inputs',()=>{
 for(const input of ['', '1/0','1e999','10+','(10+2','window.alert(1)','1;2','2**3'])assert.throws(()=>numericExpression(input));
 assert.throws(()=>boundedNumber('0',.01));assert.throws(()=>boundedNumber('61',0,60));assert.equal(boundedNumber('30*2',0,60),60);
});
