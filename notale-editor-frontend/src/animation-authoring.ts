import type {AnimationSpec,Command,Slide} from '@notale/editor/browser';

export type AnimationSequence='together'|'after'|'click';
export function sequenceAnimations(base:AnimationSpec,targets:string[],sequence:AnimationSequence,makeId:()=>string):AnimationSpec[]{
  if(sequence==='click'&&base.step+targets.length-1>500)throw Error('讲授步骤最多支持 500 步');
  return targets.map((target,index)=>({...base,id:makeId(),target,
    trigger:index===0?base.trigger:sequence==='click'?'click':sequence==='after'?'after-previous':'with-previous',
    step:base.step+(sequence==='click'?index:0),
    delay:index===0||sequence!=='together'?base.delay:0,
  }));
}
export function hasTeachingStructure(slide:Slide){return !!(slide.steps||slide.nativeStepCount||slide.stepMap.length||(slide.components??[]).some(c=>c.steps.length));}
/** Plain animation slides follow click groups; authored teaching steps retain their identities. */
export function animationOrderCommands(slide:Slide,ordered:AnimationSpec[]):Command[]{
  if(ordered.length!==slide.animations.length||new Set(ordered.map(a=>a.id)).size!==ordered.length||ordered.some(a=>!slide.animations.some(b=>b.id===a.id)))throw Error('动画列表已变化，请重试');
  let step=0;
  const normalized=hasTeachingStructure(slide)?ordered:ordered.map(a=>{
    if(a.trigger==='click')step++;
    if(step>500)throw Error('讲授步骤最多支持 500 步');
    return {...a,step};
  });
  return [...normalized.filter(a=>JSON.stringify(a)!==JSON.stringify(slide.animations.find(b=>a.id===b.id))).map(animation=>({type:'animation.set' as const,slideId:slide.id,animation})),{type:'animation.reorder',slideId:slide.id,ids:normalized.map(a=>a.id)}];
}
