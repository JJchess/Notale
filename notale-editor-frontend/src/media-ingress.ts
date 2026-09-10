/** Host-side file ingress. Native slide frames remain isolated from the editor. */
export function createMediaIngress(context:{enabled:()=>boolean;insert:(files:File[],point?:{x:number;y:number})=>Promise<void>;pasteObjects:()=>Promise<unknown>;svg?:(source:string)=>Promise<unknown>;error:(e:unknown)=>void}) {
  const viewport=document.getElementById('canvas-viewport')!;
  const overlay=document.createElement('div');overlay.id='media-drop-overlay';overlay.hidden=true;
  overlay.textContent='松开以插入图片、视频或音频';viewport.append(overlay);
  let busy=false;
  const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&(target.isContentEditable||!!target.closest('input,textarea,select,dialog[open]'));
  async function insert(files:File[],point?:{x:number;y:number}) {
    if(!files.length)return;
    if(busy)throw new Error('正在插入媒体，请稍后再试');
    if(!context.enabled())throw new Error('请先完成当前保存，并退出互动预览');
    if(files.some(file=>!['image','video','audio'].includes(file.type.split('/')[0])))throw new Error('请选择图片、视频或音频文件');
    busy=true;
    try{await context.insert(files,point);}finally{busy=false;}
  }
  document.addEventListener('dragenter',event=>{
    if(context.enabled()&&event.dataTransfer?.types.includes('Files')){event.preventDefault();const bounds=viewport.getBoundingClientRect();Object.assign(overlay.style,{left:bounds.left+'px',top:bounds.top+'px',width:bounds.width+'px',height:bounds.height+'px'});overlay.hidden=false;}
  });
  overlay.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';});
  overlay.addEventListener('dragleave',()=>{overlay.hidden=true;});
  document.addEventListener('dragend',()=>{overlay.hidden=true;});
  overlay.addEventListener('drop',event=>{
    event.preventDefault();overlay.hidden=true;
    const files=[...(event.dataTransfer?.files??[])];
    void insert(files,{x:event.clientX,y:event.clientY}).catch(context.error);
  });
  document.addEventListener('paste',event=>{
    if(editable(event.target)||!context.enabled())return;
    const files=[...(event.clipboardData?.files??[])];const source=event.clipboardData?.getData('text/plain')??'';if(!files.length&&/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source)&&context.svg){event.preventDefault();void context.svg(source).catch(context.error);return;}event.preventDefault();
    void(files.length?insert(files):context.pasteObjects()).catch(context.error);
  });
}
