export const animationEffectGroups=[
 {name:'进入',kind:'entrance',effects:['draw-stroke','appear','fade-in','fly-in','zoom-in','float-in','bounce-in','wipe-in','split-in']},
 {name:'强调',kind:'emphasis',effects:['pulse','spin']},
 {name:'退出',kind:'exit',effects:['disappear','fade-out','fly-out','zoom-out','wipe-out','split-out']},
 {name:'路径',kind:'motion',effects:['motion']},
];
export const animationEffectLabels:Record<string,string>={'draw-stroke':'描边绘制',appear:'出现','fade-in':'淡入','fly-in':'飞入','zoom-in':'缩放进入','float-in':'浮入','bounce-in':'弹跳','wipe-in':'擦除','split-in':'劈裂',pulse:'强调 · 脉冲',spin:'旋转',disappear:'消失','fade-out':'淡出','fly-out':'飞出','zoom-out':'缩小退出','wipe-out':'擦除退出','split-out':'闭合',motion:'移动路径'};
export const animationEffectSymbols:Record<string,string>={'draw-stroke':'✎',appear:'◈','fade-in':'◌','fly-in':'↘','zoom-in':'⤢','float-in':'↑','bounce-in':'↟','wipe-in':'▥','split-in':'◧',pulse:'✦',spin:'⟳',disappear:'◇','fade-out':'◌','fly-out':'↗','zoom-out':'⤡','wipe-out':'▥','split-out':'◨',motion:'↝'};
interface Gallery {group:string;enabled:boolean;clearable:boolean;selected?:string;apply?:(effect:string)=>Promise<unknown>;clear?:()=>Promise<unknown>;}
const initial:Gallery={group:'entrance',enabled:false,clearable:false};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:Gallery){model=next;listeners.forEach(listener=>listener());}
export const animationGalleryState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function selectAnimationGroup(group:string){if(animationEffectGroups.some(item=>item.kind===group))publish({...model,group});}
export function bindAnimationGallery(){const token=Symbol();owner=token;return {
 update(next:Omit<Gallery,'group'>){if(owner===token)publish({...next,group:model.group});},
 group(group:string){if(owner===token)selectAnimationGroup(group);},
 dispose(){if(owner===token){owner=undefined;publish(initial);}},
};}
export async function applyAnimationGallery(source:Gallery,effect?:string){
 if(source!==model)throw Error('动画选区已变化，请重试');
 if(effect!==undefined){if(!source.enabled||!animationEffectLabels[effect])return;await source.apply?.(effect);}
 else if(source.clearable)await source.clear?.();
}
