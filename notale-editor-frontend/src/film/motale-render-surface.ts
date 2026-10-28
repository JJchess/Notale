import type {MotaleContext,MotaleRenderResult} from './motale-bridge.js';

/** Host composition of the public bridge canvas and plain caption. The iframe's
 * internal DOM, fonts, viewer branches and live playback surface are not sampled. */
export class MotaleRenderSurface {
  private element:HTMLDivElement;
  private picture:HTMLDivElement;
  private captions:HTMLDivElement;
  private buffers:[HTMLCanvasElement,HTMLCanvasElement];
  private front=0;
  private active=false;
  private disposed=false;
  private generation=0;
  private signature='';
  private instance?:MotaleContext['instance'];
  private pending?:AbortController;
  private previousVisibility='';
  private previousPointerEvents='';
  ready=false;
  error?:string;
  constructor(private parent:HTMLElement,private iframe:HTMLIFrameElement,private failure:(message:string)=>void){
    const doc=parent.ownerDocument;
    this.element=doc.createElement('div');this.element.className='film-motale-render';
    this.element.style.cssText='position:absolute;inset:0;background:#090909;pointer-events:none;overflow:hidden';
    this.picture=doc.createElement('div');this.picture.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:hidden;pointer-events:none';
    this.buffers=[doc.createElement('canvas'),doc.createElement('canvas')];
    for(const canvas of this.buffers){canvas.className='film-motale-frame';canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';canvas.hidden=true;canvas.width=canvas.height=0;}
    this.captions=doc.createElement('div');this.captions.className='film-motale-caption';
    // BRIDGE-v0 returns caption text separately. Match the preset's baseline
    // placement using host typography, without depending on private shell DOM.
    this.captions.style.cssText='position:absolute;left:0;right:0;bottom:4%;padding:0 8%;box-sizing:border-box;text-align:center;color:#f4f4f4;font-family:system-ui,"Noto Sans CJK SC",sans-serif;font-weight:400;line-height:1.5;text-wrap:balance;text-shadow:0 2px 12px rgba(0,0,0,.85);pointer-events:none;white-space:normal';
    this.picture.append(...this.buffers,this.captions);this.element.append(this.picture);
  }
  private activate(){
    if(this.active)return;
    this.active=true;this.previousVisibility=this.iframe.style.visibility;this.previousPointerEvents=this.iframe.style.pointerEvents;
    this.iframe.style.visibility='hidden';this.iframe.style.pointerEvents='none';
    this.parent.append(this.element);
  }
  private cancel(){this.generation++;this.pending?.abort();this.pending=undefined;}
  /** A deterministic failure must never leave a formerly successful frame ready. */
  block(message:string){
    if(this.disposed)return false;this.activate();
    if(this.error!==message){this.cancel();this.signature='';this.error=message;this.ready=false;this.picture.hidden=true;this.failure(message);}
    return false;
  }
  prepare(context:MotaleContext,width:number,viewport:{width:number;height:number}):boolean{
    if(this.disposed)return false;
    this.activate();
    if(context.error)return this.block(context.error);
    if(!context.act.renderAct||context.act.state!=='ok')return this.block('此幕不支持独立帧渲染');
    width=Math.max(1,Math.min(4096,Math.round(width)));
    const revision=context.bridge.state().authorRevision;
    const signature=JSON.stringify([context.hello.film,context.act.id,context.act.revision,context.time,revision,width,viewport.width,viewport.height]);
    if(this.instance===context.instance&&this.signature===signature)return this.ready;
    this.cancel();this.instance=context.instance;this.signature=signature;this.ready=false;this.error=undefined;
    // Keep the previous front buffer until the complete next frame is available.
    // captureReady remains false throughout; a stale frame can never be captured.
    const pictureWidth=Math.min(viewport.width,viewport.height*16/9),pictureHeight=pictureWidth*9/16;
    this.picture.style.width=`${pictureWidth}px`;this.picture.style.height=`${pictureHeight}px`;
    this.captions.style.fontSize=`${Math.min(26,Math.max(14,pictureWidth*.021))}px`;
    const controller=new AbortController(),generation=this.generation;
    this.pending=controller;
    const author=context.bridge.author.get();
    let rendered:MotaleRenderResult|undefined;
    void context.bridge.renderAct(context.act.id,context.time,{width,parameters:'film',playback:'playing',author,signal:controller.signal})
      .then(result=>{
        rendered=result;
        if(this.disposed||!this.active||controller.signal.aborted||generation!==this.generation)return;
        if(result.actId!==context.act.id||result.t!==context.time||result.authorRevision!==revision||
          result.width!==width||result.height!==Math.round(width*9/16)||result.canvas.width!==result.width||result.canvas.height!==result.height||
          context.bridge.state().authorRevision!==revision)throw Error('场景返回了不同帧或修订版本');
        const next=1-this.front,canvas=this.buffers[next],paint=canvas.getContext('2d');
        if(!paint)throw Error('场景合成画布不可用');
        canvas.width=result.width;canvas.height=result.height;
        paint.drawImage(result.canvas,0,0);
        this.captions.textContent=result.caption??'';
        this.captions.hidden=!result.caption;
        canvas.hidden=false;this.buffers[this.front].hidden=true;this.front=next;
        this.picture.hidden=false;this.ready=true;this.pending=undefined;
      })
      .catch(error=>{
        if(this.disposed||!this.active||controller.signal.aborted||generation!==this.generation)return;
        this.ready=false;this.pending=undefined;this.error=error instanceof Error?error.message:String(error);
        this.picture.hidden=true;this.failure(this.error);
      })
      .finally(()=>{
        // renderAct allocated this canvas exclusively for this request; neither
        // front nor back is exposed to the iframe, including cancelled requests.
        if(rendered){rendered.canvas.width=0;rendered.canvas.height=0;}
      });
    return false;
  }
  deactivate(){
    if(!this.active&&!this.pending)return;
    this.cancel();this.ready=false;this.error=undefined;this.signature='';this.instance=undefined;
    if(this.active){this.active=false;this.iframe.style.visibility=this.previousVisibility;this.iframe.style.pointerEvents=this.previousPointerEvents;}
    this.element.remove();this.captions.textContent='';
    for(const canvas of this.buffers){canvas.width=canvas.height=0;canvas.hidden=true;}
  }
  dispose(){if(this.disposed)return;this.deactivate();this.disposed=true;}
}
