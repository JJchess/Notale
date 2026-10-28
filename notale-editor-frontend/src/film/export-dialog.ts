import {translateUi as t,localeStore} from '../i18n/store.js';
import {localizeStaticFilmUI} from './ui-locale.js';
import {filmDuration,type FilmDocument} from '@notale/editor/film';

export function showFilmExport(root:HTMLElement,document:FilmDocument,position:number,range?:{start:number;end:number}){
 const dialog=window.document.createElement('dialog');dialog.className='film-export-dialog';
 const length=filmDuration(document);
 dialog.innerHTML=`<form method="dialog"><h2>导出影片</h2><label>格式<select name="format"><option value="mp4">视频</option><option value="gif">GIF 动图</option><option value="png">PNG 当前帧</option><option value="png-sequence">PNG 帧序列</option><option value="slides-png">场景 PNG 集</option><option value="slides-pdf">场景 PDF</option><option value="slides-pptx">场景 PPTX</option><option value="wav">WAV 混音</option><option value="stems">WAV 分轨</option><option value="subtitles">VTT / SRT 字幕</option><option value="otio">OTIO 剪辑工程 + 媒体</option><option value="html">交互 HTML 包</option></select></label><label data-slides>静帧选取<select name="slidesMode"><option value="scenes">剪辑点、讲义步骤与标记</option><option value="markers">影片标记</option><option value="interval">固定间隔</option></select></label><label data-slides-interval>静帧间隔（秒）<input name="slidesInterval" type="number" value="5" min="0.1" max="3600" step="0.1"></label><label data-video>编码<select name="codec"><option value="h264">H.264 · MP4</option><option value="hevc">HEVC · MP4</option><option value="vp9">VP9 · WebM</option><option value="prores422hq">ProRes 422 HQ · MOV</option><option value="prores4444">ProRes 4444 · MOV</option><option disabled>HEVC Alpha（当前环境不支持）</option></select></label><label data-video>质量<select name="quality"><option value="standard">标准</option><option value="high" selected>高</option><option value="master">精细</option></select></label><label data-motion>导出帧率<select name="fps"><option value="original">原影片</option><option value="24000/1001">23.976</option><option value="24/1">24</option><option value="25/1">25</option><option value="30000/1001">29.97</option><option value="30/1">30</option><option value="50/1">50</option><option value="60000/1001">59.94</option><option value="60/1">60</option></select></label><label data-motion>运动模糊<select name="motionBlur"><option value="1">关闭</option><option value="4">4 次采样 · 180° 快门</option><option value="8">8 次采样 · 180° 快门</option></select></label><label data-alpha><input name="transparent" type="checkbox"> 透明背景</label><label>尺寸<select name="scale"><option value="1">原始尺寸（${document.width} × ${document.height}）</option><option value="0.5">50%</option><option value="0.25">25%</option><option value="2">200%</option></select></label><div class="film-export-range"><label>入点（帧）<input name="start" type="number" min="0" max="${length-1}" value="${range?.start??0}"></label><label>出点（帧，不含）<input name="end" type="number" min="1" max="${length}" value="${range?.end??length}"></label></div><label><input name="captions" type="checkbox" checked> 烧录字幕</label><label>字幕语言<select name="language"><option value="all">全部</option></select></label><p data-role="note"></p><progress max="1" value="0" hidden></progress><p data-role="result" role="status"></p><div class="film-export-actions"><button type="button" data-action="start">开始导出</button><button type="button" data-action="cancel" hidden>取消任务</button><button type="button" data-action="retry" hidden>从原快照重试</button><button value="close">关闭</button></div></form>`;
 const lifetime=new AbortController();localizeStaticFilmUI(dialog,lifetime.signal);root.append(dialog);
 const find=<T extends HTMLElement>(selector:string)=>dialog.querySelector<T>(selector)!;
 const format=find<HTMLSelectElement>('[name=format]'),scale=find<HTMLSelectElement>('[name=scale]'),start=find<HTMLInputElement>('[name=start]'),end=find<HTMLInputElement>('[name=end]'),captions=find<HTMLInputElement>('[name=captions]'),language=find<HTMLSelectElement>('[name=language]'),result=find('[data-role=result]'),progress=find<HTMLProgressElement>('progress'),launch=find<HTMLButtonElement>('[data-action=start]'),cancel=find<HTMLButtonElement>('[data-action=cancel]');
 for(const track of document.tracks)if(track.kind==='subtitle')language.add(new Option(track.title,track.language));
 const codec=find<HTMLSelectElement>('[name=codec]'),quality=find<HTMLSelectElement>('[name=quality]'),fps=find<HTMLSelectElement>('[name=fps]'),motionBlur=find<HTMLSelectElement>('[name=motionBlur]'),transparent=find<HTMLInputElement>('[name=transparent]');
 const slidesMode=find<HTMLSelectElement>('[name=slidesMode]'),slidesInterval=find<HTMLInputElement>('[name=slidesInterval]');
 const retry=find<HTMLButtonElement>('[data-action=retry]'),storageKey='notale-film-export:'+document.id;
 let capabilityReady=false;let availability:Record<string,{available:boolean;reason?:string}>={};
 let jobId:string|undefined,requestId:string|undefined,timer:ReturnType<typeof setTimeout>|undefined,closed=false,lastJob:any,pending=false,networkError='';
 const remember=()=>{try{localStorage.setItem(storageKey,JSON.stringify({jobId,requestId}));}catch{}};
 try{const saved=JSON.parse(localStorage.getItem(storageKey)??'null');jobId=typeof saved?.jobId==='string'?saved.jobId:undefined;requestId=typeof saved?.requestId==='string'?saved.requestId:undefined;}catch{}
 const show=(value:string)=>{result.textContent=t(value);};
 function busy(value:boolean){pending=value;for(const control of dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))control.disabled=value;launch.disabled=value;if(!value)update();}

 const request=async(uri:string,init?:RequestInit)=>{const r=await fetch(uri,{...init,signal:lifetime.signal}),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error??`导出失败（${r.status}）`),{status:r.status});return data;};
 function update(){launch.disabled=pending||!capabilityReady||availability[format.value]?.available===false;const slides=format.value.startsWith('slides-');find('[data-slides]').hidden=!slides;find('[data-slides-interval]').hidden=!slides||slidesMode.value!=='interval';const video=format.value==='mp4',motion=video||['gif','png-sequence'].includes(format.value),audio=['wav','stems'].includes(format.value);dialog.querySelectorAll<HTMLElement>('[data-video]').forEach(n=>n.hidden=!video);dialog.querySelectorAll<HTMLElement>('[data-motion]').forEach(n=>n.hidden=!motion);quality.disabled=codec.value.startsWith('prores');find('[data-alpha]').hidden=!['png','png-sequence'].includes(format.value)&&!(video&&['vp9','prores4444'].includes(codec.value));if(find('[data-alpha]').hidden)transparent.checked=false;const whole=['html','otio','subtitles'].includes(format.value),still=format.value==='png';start.disabled=end.disabled=whole;end.disabled||=still;scale.disabled=audio||whole&&format.value!=='otio';captions.disabled=language.disabled=audio||whole;if(still){start.value=String(Math.min(length-1,position));end.value=String(Number(start.value)+1);}else if(Number(end.value)<=Number(start.value))end.value=String(length);find('[data-role=note]').textContent=t(slides?'每页为合成画面的图片，最多 200 张；PPTX 备注保留源时间。':format.value==='otio'?'保留剪辑点和轨道，效果烘焙为 ProRes 4444；跨轨混合模式需使用 MP4 保留。':format.value==='html'?'保留网页交互；解压后通过 HTTP 服务打开。':'导出使用当前影片快照。素材需已导入本地。');}
 format.onchange=codec.onchange=slidesMode.onchange=()=>{update();const reason=availability[format.value]?.reason;if(reason&&!pending)show(reason);};update();
 void request('/film-export/capabilities').then(value=>{if(closed)return;availability=value.availability??{};capabilityReady=true;for(const option of format.options){const state=availability[option.value];option.disabled=state?.available===false;option.title=state?.reason??'';}update();if(availability[format.value]?.reason&&!pending)show(availability[format.value]!.reason!);}).catch(error=>{if(!closed){show(error.message);launch.disabled=true;}});
 function renderStatus(){
  if(networkError){show('连接中断，正在重新连接导出任务…');return;}
  const job=lastJob;if(!job)return;
  if(job.state==='complete'){
   result.replaceChildren();const a=window.document.createElement('a');a.href=job.download;a.download='';a.textContent=t('下载');result.append(a);
   if(job.preview){const preview=window.document.createElement('a');preview.href=job.preview;preview.target='_blank';preview.rel='noopener';preview.textContent=t('打开交互预览');result.append(' · ',preview);}
  }else if(job.state==='failed')show(job.error??'导出失败');
  else if(job.state==='cancelled')show('任务已取消');
  else if(job.state==='cancelling')show('正在取消…');
  else if(job.phase==='preparing')show('正在固定素材快照…');
  else if(job.state==='queued')show('排队中');
  else result.textContent=t('正在导出 {percent}%',{percent:Math.round(job.progress*100)});
 }
 function later(){if(!closed){if(timer)clearTimeout(timer);timer=setTimeout(()=>void poll(),networkError?1500:700);}}
 async function poll(){
  if(closed||!jobId&&!requestId)return;
  try{
   const job=await request(jobId?`/film-export/jobs/${jobId}`:`/film-export/jobs/by-request?documentId=${encodeURIComponent(document.id)}&requestId=${encodeURIComponent(requestId!)}`);
   if(closed)return;jobId=job.id;remember();networkError='';lastJob=job;progress.hidden=false;progress.value=job.progress;
   const terminal=['complete','failed','cancelled'].includes(job.state);busy(!terminal);cancel.hidden=terminal;cancel.disabled=job.state==='cancelling';retry.hidden=!['failed','cancelled'].includes(job.state);retry.disabled=false;renderStatus();if(!terminal)later();
  }catch(error){if(closed)return;const status=(error as {status?:number}).status;if(status===404){show('导出任务不存在，请重新导出');jobId=requestId=undefined;remember();busy(false);cancel.hidden=true;return;}networkError=String(error);busy(true);renderStatus();later();}
 }
 launch.onclick=async()=>{
  if(pending)return;busy(true);retry.hidden=true;cancel.hidden=true;progress.hidden=false;progress.value=0;networkError='';show('创建导出任务…');requestId=crypto.randomUUID();jobId=undefined;remember();
  try{
   const whole=['html','otio','subtitles'].includes(format.value),job=await request('/film-export/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientRequestId:requestId,document,options:{format:format.value,slidesMode:slidesMode.value,slidesInterval:Number(slidesInterval.value),scale:Number(scale.value),start:whole?0:Number(start.value),end:whole?length:Number(end.value),codec:codec.value,quality:quality.value,frameRate:fps.value==='original'?undefined:{numerator:Number(fps.value.split('/')[0]),denominator:Number(fps.value.split('/')[1])},motionBlur:['mp4','gif','png-sequence'].includes(format.value)?Number(motionBlur.value):1,transparent:transparent.checked,burnCaptions:captions.checked,languages:language.value==='all'?undefined:[language.value]}})});
   jobId=job.id;remember();if(!closed){cancel.hidden=false;void poll();}
  }catch(error){if(closed)return;if((error as {status?:number}).status){show(String(error));jobId=requestId=undefined;remember();busy(false);}else{networkError=String(error);renderStatus();later();}}
 };
 retry.onclick=async()=>{if(!jobId||pending)return;const old=jobId;busy(true);retry.disabled=true;requestId=crypto.randomUUID();jobId=undefined;remember();try{const job=await request(`/film-export/jobs/${old}/retry`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientRequestId:requestId})});jobId=job.id;remember();void poll();}catch(error){if(closed)return;if((error as {status?:number}).status){jobId=old;remember();show(String(error));busy(false);retry.disabled=false;}else{networkError=String(error);renderStatus();later();}}};
 cancel.onclick=()=>{if(jobId){cancel.disabled=true;void request(`/film-export/jobs/${jobId}`,{method:'DELETE'}).then(()=>poll()).catch(error=>{if(!closed){networkError=String(error);renderStatus();later();}});}};
 const unsubscribe=localeStore.subscribe(()=>{update();if(pending)for(const control of dialog.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select'))control.disabled=true;renderStatus();});
 dialog.addEventListener('close',()=>{closed=true;if(timer)clearTimeout(timer);lifetime.abort();unsubscribe();dialog.remove();});dialog.showModal();format.focus();
 if(jobId||requestId){busy(true);progress.hidden=false;void poll();}
 return dialog;
}
