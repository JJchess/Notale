const $=id=>document.getElementById(id), shape=$('shape'),scrub=$('scrub'),frame=$('frame'),status=$('status');
let index=0,playing=false,version=0,timer;
const cache=new Map();
function get(group,n){const key=`${group}/${String(n).padStart(5,'0')}`;if(!cache.has(key)){const img=new Image();img.src=`assets/animations/${key}.png`;cache.set(key,img.decode().then(()=>img).catch(e=>{cache.delete(key);throw e}));}const result=cache.get(key);while(cache.size>60)cache.delete(cache.keys().next().value);return result}
function stop(){version++;playing=false;clearTimeout(timer);$('play').textContent='播放';status.textContent='已暂停 · 拖动滑块或逐帧查看'}
async function show(n){const token=++version,group=shape.value;n=Math.max(0,Math.min(359,n));status.textContent='正在载入原图…';try{const img=await get(group,n);if(token!==version)return false;frame.src=img.src;index=n;scrub.value=n;$('count').textContent=`${String(n+1).padStart(3,'0')} / 360`;frame.alt=`${shape.selectedOptions[0].textContent}实验第 ${n+1} 帧，四路原始绘画对照`;status.textContent=playing?'播放中 · 四路同步':n===359?'已到最后一帧':'已暂停 · 拖动滑块或逐帧查看';for(let k=n+1;k<Math.min(360,n+9);k++)get(group,k).catch(()=>{});return true}catch(e){if(token===version){stop();status.textContent='原图加载失败，请重新选择帧重试'}return false}}
async function tick(){if(!playing)return;const start=performance.now();if(index===359){stop();status.textContent='已到最后一帧';return}const ok=await show(index+1);if(playing&&ok)timer=setTimeout(tick,Math.max(0,1000/+$('speed').value-(performance.now()-start)))}
$('play').onclick=async()=>{if(playing){stop();return}if(index===359&&!await show(0))return;playing=true;$('play').textContent='暂停';tick()};
scrub.oninput=()=>{stop();show(+scrub.value)};shape.onchange=()=>{stop();show(index)};
$('prev').onclick=()=>{stop();show(index-1)};$('next').onclick=()=>{stop();show(index+1)};$('reset').onclick=()=>{stop();show(0)};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
show(0);
