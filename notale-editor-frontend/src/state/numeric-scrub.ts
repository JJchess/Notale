import {numericExpression} from './numeric-expression';

interface NumericScrub {
  read:()=>string;
  limits:()=>{min?:number;max?:number;step?:number;integer?:boolean};
  start:()=>void;
  change:(value:string)=>void;
  finish:(cancelled:boolean)=>void;
}
/** Labels scrub; inputs keep their normal caret, selection and keyboard behavior. */
export function bindNumericScrub(input:HTMLInputElement,options:NumericScrub){
 const label=input.closest('label');if(!label)return ()=>{};
 const abort=new AbortController(),signal=abort.signal;
 let gesture:{pointer:number;origin:number;last:number;value:number;started:boolean}|undefined;
 let suppressClick=false;
 label.dataset.numberScrub='';
 const end=(cancelled:boolean)=>{
  const active=gesture;if(!active)return;gesture=undefined;
  delete label.dataset.scrubbing;
  if(label.hasPointerCapture(active.pointer))label.releasePointerCapture(active.pointer);
  if(active.started){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);options.finish(cancelled);}
 };
 label.addEventListener('pointerdown',event=>{
  if(gesture||event.button!==0||event.pointerType==='touch'||input.matches(':disabled')||input.readOnly)return;
  const target=event.target;if(!(target instanceof Element)||target.closest('input,select,textarea,button,a'))return;
  let value:number;try{value=numericExpression(options.read());}catch{return;}
  event.preventDefault();input.focus({preventScroll:true});
  gesture={pointer:event.pointerId,origin:event.clientX,last:event.clientX,value,started:false};
  label.setPointerCapture(event.pointerId);
 },{signal});
 label.addEventListener('pointermove',event=>{
  const active=gesture;if(!active||event.pointerId!==active.pointer)return;
  if(input.matches(':disabled')||!input.isConnected){end(true);return;}
  if(!active.started){if(Math.abs(event.clientX-active.origin)<3)return;active.started=true;label.dataset.scrubbing='';options.start();}
  event.preventDefault();
  const limits=options.limits(),step=limits.step&&limits.step>0?limits.step:1;
  const increment=step*(event.shiftKey?10:event.altKey&&!limits.integer?0.1:1);
  active.value=Math.max(limits.min??-Infinity,Math.min(limits.max??Infinity,active.value+(event.clientX-active.last)*increment));active.last=event.clientX;
  const value=limits.integer?Math.round(active.value):Number(active.value.toPrecision(12));
  options.change(String(value));
 },{signal});
 label.addEventListener('pointerup',event=>{if(event.pointerId===gesture?.pointer)end(false);},{signal});
 label.addEventListener('pointercancel',()=>end(true),{signal});
 label.addEventListener('lostpointercapture',()=>end(true),{signal});
 label.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopPropagation();}},{signal,capture:true});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&gesture){event.preventDefault();event.stopPropagation();end(true);}else if(gesture?.started&&!['Shift','Alt','Control','Meta'].includes(event.key)){event.preventDefault();event.stopPropagation();}},{signal,capture:true});
 window.addEventListener('keyup',event=>{if(gesture?.started&&!['Shift','Alt','Control','Meta'].includes(event.key)){event.preventDefault();event.stopPropagation();}},{signal,capture:true});
 window.addEventListener('blur',()=>end(true),{signal});
 input.addEventListener('blur',()=>end(true),{signal});
 return ()=>{end(true);abort.abort();delete label.dataset.numberScrub;delete label.dataset.scrubbing;};
}
