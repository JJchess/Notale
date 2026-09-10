type Point = {x:number;y:number};
/** A small path canvas edits authored offsets; pointer moves remain local until release. */
export function createAnimationPath(host:HTMLElement, changed:()=>void) {
  let points:Point[]=[];
  host.innerHTML='<summary>编辑运动路径</summary><label>路径<select data-path-preset><option value="line">直线</option><option value="arc">弧线</option><option value="zigzag">折线</option><option value="custom">自定义</option></select></label><svg class="motion-path-canvas" viewBox="-180 -120 360 240" aria-label="拖动控制点调整运动路径"></svg><div data-path-points></div><button type="button" data-path-add>＋ 控制点</button><p class="hint">起点为对象当前位置；拖动圆点，或输入相对位移。</p>';
  const svg=host.querySelector<SVGSVGElement>('svg')!,rows=host.querySelector<HTMLElement>('[data-path-points]')!;
  const preset=host.querySelector<HTMLSelectElement>('[data-path-preset]')!;
  let box={x:-180,y:-120,w:360,h:240};
  function draw(fit=true){
    if(fit){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(0,...xs)-50,minY=Math.min(0,...ys)-50;box={x:minX,y:minY,w:Math.max(160,Math.max(0,...xs)-minX+50),h:Math.max(120,Math.max(0,...ys)-minY+50)};svg.setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);}
    const size=Math.max(box.w,box.h)/45;
    svg.innerHTML=`<path d="${points.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')}" fill="none" stroke="#946bcc" stroke-width="${size/3}" stroke-dasharray="${size/2} ${size/2}"/>`+points.map((p,i)=>`<circle data-point="${i}" cx="${p.x}" cy="${p.y}" r="${size}" fill="${i?'#946bcc':'#3a9b73'}" stroke="white" stroke-width="${size/3}"/>`).join('');
  }
  function render(){draw();rows.innerHTML=points.map((p,i)=>`<div class="motion-path-point"><span>${i===0?'起点':i===points.length-1?'终点':i}</span><label>X<input type="number" data-axis="x" data-index="${i}" value="${p.x}" ${i===0?'disabled':''}></label><label>Y<input type="number" data-axis="y" data-index="${i}" value="${p.y}" ${i===0?'disabled':''}></label><button type="button" data-remove-point="${i}" title="删除控制点" aria-label="删除控制点" ${i===0||points.length<=2?'disabled':''}>×</button></div>`).join('');}
  rows.addEventListener('change',event=>{const input=event.target as HTMLInputElement;if(!input.dataset.axis||!input.reportValidity()||input.value==='')return;points[Number(input.dataset.index)][input.dataset.axis as 'x'|'y']=Number(input.value);preset.value='custom';draw();changed();});
  rows.addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLElement>('[data-remove-point]');if(!b)return;const i=Number(b.dataset.removePoint);if(i>0&&points.length>2){points.splice(i,1);preset.value='custom';render();changed();}});
  host.querySelector<HTMLButtonElement>('[data-path-add]')!.onclick=()=>{if(points.length>=50)return;const end=points.at(-1)??{x:0,y:0};points.push({x:end.x+60,y:end.y});preset.value='custom';render();changed();};
  preset.onchange=()=>{if(preset.value==='custom')return;points=preset.value==='arc'?[{x:0,y:0},{x:45,y:-55},{x:100,y:-80},{x:155,y:-55},{x:200,y:0}]:preset.value==='zigzag'?[{x:0,y:0},{x:65,y:-60},{x:130,y:60},{x:200,y:0}]:[{x:0,y:0},{x:200,y:0}];render();changed();};
  let drag:{index:number;pointer:number;original:Point[]}|undefined;
  svg.onpointerdown=event=>{const target=event.target as SVGElement,index=Number(target.dataset.point);if(target.dataset.point===undefined||index===0||event.button!==0)return;drag={index,pointer:event.pointerId,original:structuredClone(points)};svg.setPointerCapture(event.pointerId);event.preventDefault();};
  svg.onpointermove=event=>{if(!drag||drag.pointer!==event.pointerId)return;const matrix=svg.getScreenCTM();if(!matrix)return;const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());points[drag.index]={x:Math.round(p.x),y:Math.round(p.y)};draw(false);};
  svg.onpointerup=event=>{if(!drag||drag.pointer!==event.pointerId)return;drag=undefined;svg.releasePointerCapture(event.pointerId);preset.value='custom';render();changed();};
  svg.onpointercancel=()=>{if(drag){points=drag.original;drag=undefined;render();}};
  return {get:()=>structuredClone(points),set(value:Point[]){points=structuredClone(value);preset.value=points.length>2?'custom':'line';render();}};
}
