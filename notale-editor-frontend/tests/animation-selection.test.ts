import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AnimationSelection} from '../src/state/animation-selection';
test('animation session keeps a newly chosen cue across temporary snapshots but resets for a new document',()=>{
 const selection=new AnimationSelection();selection.sync('doc','page',['target'],[]);
 selection.selected='new';assert.equal(selection.sync('doc','page',['target'],[]),false);assert.equal(selection.selected,'new');
 selection.sync('doc','page',['target'],[{id:'old',target:'target'},{id:'new',target:'target'}]);assert.equal(selection.selected,'new');
 assert.equal(selection.sync('other-doc','page',['target'],[{id:'other',target:'target'}]),true);assert.equal(selection.selected,'other');
 selection.select('chosen','doc','page',['a','b']);assert.equal(selection.sync('doc','page',['b','a'],[]),false);assert.equal(selection.selected,'chosen');
});
