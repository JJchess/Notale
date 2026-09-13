import {test} from 'node:test';
import assert from 'node:assert/strict';
import {animationListState,bindAnimationList,type AnimationListModel} from '../src/state/animation-list';
const view=():AnimationListModel=>({scope:"test",rows:[],current:()=>true,edit(){},preview(){},copy(){},remove(){},move(){},drop(){},commit:async()=>{},error(){}});
test('animation focus persists across model refresh and is isolated from old owners',()=>{
 const first=bindAnimationList();first.update(view());const old=animationListState.getSnapshot()!;old.focus!(true);first.update(view());assert.equal(first.focused,true);
 const second=bindAnimationList();second.update(view());const current=animationListState.getSnapshot()!;current.focus!(true);old.focus!(false);first.update(view());first.dispose();assert.equal(animationListState.getSnapshot(),current);assert.equal(second.focused,true);assert.equal(first.focused,false);second.dispose();assert.equal(animationListState.getSnapshot(),undefined);
});
