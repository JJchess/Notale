import {localizeStaticFilmUI} from './ui-locale';
import {translateUi as filmText} from '../i18n/store';
type RGBA=[number,number,number,number];
const recentKey='notale-film-recent-colors-v1';
function rgba(value:string):RGBA|undefined {
 if(!CSS.supports('color',value)||/var\(|currentcolor/i.test(value))return;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
 const context=canvas.getContext('2d',{willReadFrequently:true})!;context.fillStyle=value;context.fillRect(0,0,1,1);
 return [...context.getImageData(0,0,1,1).data] as RGBA;
}
function hsv([r,g,b]:RGBA){const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;return [delta?((max===r?(g-b)/delta:max===g?(b-r)/delta+2:(r-g)/delta+4)*60+360)%360:0,max?delta/max:0,max/255];}
function rgb(h:number,s:number,v:number):number[]{const f=(n:number)=>{const k=(n+h/60)%6;return Math.round(255*v*(1-s*Math.max(0,Math.min(k,4-k,1))));};return [f(5),f(3),f(1)];}
const hex=(value:number[])=>'#'+value.map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');
function recent():string[]{try{const values=JSON.parse(localStorage.getItem(recentKey)??'[]');return Array.isArray(values)?values.filter((v:unknown)=>typeof v==='string'&&/^#[a-f0-9]{6}(?:[a-f0-9]{2})?$/i.test(v)).slice(0,12):[];}catch{return [];}}
/** Attach to an existing CSS input. Only Apply commits; cancel leaves the author value intact. */
export function attachColorPicker(input:HTMLInputElement,title:string){
 input.type='text';if(!input.id)input.id='film-color-'+crypto.randomUUID();const label=input.closest('label');if(label)label.htmlFor=input.id;if(!input.hasAttribute('aria-label'))input.setAttribute('aria-label',title);const wrap=document.createElement('span');wrap.className='film-color-input';input.replaceWith(wrap);wrap.append(input);
 const swatch=document.createElement('button');swatch.type='button';swatch.className='film-color-swatch';swatch.title='选择'+title;swatch.setAttribute('aria-label','选择'+title);wrap.prepend(swatch);
 const refresh=()=>{swatch.style.setProperty('--film-swatch',CSS.supports('color',input.value)?input.value:'transparent');swatch.disabled=input.disabled;};input.addEventListener('input',refresh);input.addEventListener('change',refresh);
 swatch.onclick=()=>{if(input.disabled)return;const host=input.closest<HTMLElement>('.film-workbench')??document.body;const dialog=document.createElement('dialog');dialog.className='film-color-dialog';dialog.setAttribute('aria-label','选择'+title);
  const parsed=rgba(input.value)??[255,255,255,255];let [h,s,v]=hsv(parsed),alpha=parsed[3]/255;
  dialog.innerHTML='<div class="film-color-sv" aria-label="饱和度与明度" role="group"><span></span></div><label>色相<input name="hue" type="range" min="0" max="360" step="1"></label><div class="film-color-numbers"><label>饱和度<input name="saturation" type="number" min="0" max="100" step="1"></label><label>明度<input name="value" type="number" min="0" max="100" step="1"></label><label>透明度<input name="alpha" type="number" min="0" max="100" step="1"></label></div><label>颜色值<input name="css" type="text"></label><div class="film-color-result"></div><div class="film-color-recents" aria-label="最近颜色"></div><p role="status"></p><div class="film-actions"><button type="button" data-eye title="屏幕取色" aria-label="屏幕取色">⌾</button><button type="button" data-reset title="恢复打开时颜色" aria-label="恢复打开时颜色">↺</button><button type="button" data-apply>应用</button><button type="button" data-close>取消</button></div>';
 localizeStaticFilmUI(dialog);
  const field=(name:string)=>dialog.querySelector<HTMLInputElement>(`[name=${name}]`)!;
  const sv=dialog.querySelector<HTMLElement>('.film-color-sv')!,point=sv.querySelector<HTMLElement>('span')!,result=dialog.querySelector<HTMLElement>('.film-color-result')!,status=dialog.querySelector<HTMLElement>('[role=status]')!,apply=dialog.querySelector<HTMLButtonElement>('[data-apply]')!;
  const value=()=>hex([...rgb(h,s,v),...(alpha<1?[alpha*255]:[])]);
  const paint=()=>{const color=value();sv.style.backgroundColor=`hsl(${h},100%,50%)`;point.style.left=s*100+'%';point.style.top=(1-v)*100+'%';result.style.setProperty('--film-swatch',color);field('hue').value=String(h);field('saturation').value=String(Math.round(s*100));field('value').value=String(Math.round(v*100));field('alpha').value=String(Math.round(alpha*100));field('css').value=color;status.textContent='';apply.disabled=false;};
  const fromCss=(text:string)=>{const next=rgba(text);if(!next){status.textContent=filmText('请输入有效的颜色值');apply.disabled=true;return;}[h,s,v]=hsv(next);alpha=next[3]/255;paint();};
  field('hue').oninput=()=>{h=field('hue').valueAsNumber;paint();};
  for(const name of ['saturation','value','alpha'])field(name).onchange=()=>{const n=field(name).valueAsNumber;if(!Number.isFinite(n)||n<0||n>100){status.textContent=filmText('数值须在 0–100 之间');apply.disabled=true;return;}if(name==='saturation')s=n/100;else if(name==='value')v=n/100;else alpha=n/100;paint();};
  field('css').onchange=()=>fromCss(field('css').value);
  sv.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();const controller=new AbortController();sv.setPointerCapture(event.pointerId);const move=(e:PointerEvent)=>{const box=sv.getBoundingClientRect();s=Math.min(1,Math.max(0,(e.clientX-box.left)/box.width));v=1-Math.min(1,Math.max(0,(e.clientY-box.top)/box.height));paint();};move(event);sv.addEventListener('pointermove',move,{signal:controller.signal});const end=()=>{controller.abort();if(sv.hasPointerCapture(event.pointerId))sv.releasePointerCapture(event.pointerId);};for(const type of ['pointerup','pointercancel','lostpointercapture'])sv.addEventListener(type,end,{signal:controller.signal});dialog.addEventListener('close',end,{once:true,signal:controller.signal});};
  for(const color of recent()){const button=document.createElement('button');button.type='button';button.className='film-color-swatch';button.title=color;button.setAttribute('aria-label','最近颜色 '+color);button.style.setProperty('--film-swatch',color);button.onclick=()=>fromCss(color);dialog.querySelector('.film-color-recents')!.append(button);}
  const eye=dialog.querySelector<HTMLButtonElement>('[data-eye]')!,Eye=(window as unknown as {EyeDropper?:new()=>{open:(options:{signal:AbortSignal})=>Promise<{sRGBHex:string}>}}).EyeDropper,abort=new AbortController();eye.hidden=!Eye;eye.onclick=async()=>{try{const picked=await new Eye!().open({signal:abort.signal});if(dialog.isConnected)fromCss(picked.sRGBHex);}catch(error){if((error as Error).name!=='AbortError'&&dialog.isConnected)status.textContent=String(error);}};
  dialog.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=()=>{[h,s,v]=hsv(parsed);alpha=parsed[3]/255;paint();};dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>dialog.close();
  apply.onclick=()=>{const color=value();input.value=color;refresh();dialog.close();try{localStorage.setItem(recentKey,JSON.stringify([color,...recent().filter(c=>c!==color)].slice(0,12)));}catch{/* storage is optional */}input.dispatchEvent(new Event('change',{bubbles:true}));};
  dialog.onclose=()=>{abort.abort();dialog.remove();swatch.focus();};host.append(dialog);paint();dialog.showModal();field('css').focus();
 };refresh();return {refresh};
}
export const isPickerColor=(value:string)=>!!rgba(value);
