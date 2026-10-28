import type {FilmMotaleAuthor,FilmMotaleObject} from '@notale/editor/film';

export type MotaleAuthor = FilmMotaleAuthor;
export type MotaleBox = [number, number, number, number];
export type MotaleParameters = 'film' | 'live' | Record<string, unknown>;
export type MotaleMatrix=[number,number,number,number,number,number];
export interface MotalePropState {
  type:'number'|'color'|'boolean'|'string'|'tex'|'numbers';keyable:boolean;base:unknown;value:unknown;
  unit?:string;min?:number;max?:number;maxLength?:number;length?:number;
}
export interface MotaleBridgeObject {
  id:string;name:string|null;kind:string;parent:string|null;order:number|null;
  bounds:MotaleBox|null;visible:boolean;text:string|null;drawn:'vector'|'canvas';editable:boolean;
  source?:string|null;can?:{duplicate:true|string;remove:true|string};
  props:Record<string,MotalePropState>;matrix?:MotaleMatrix;pivot?:[number,number]|null;
}
export interface MotalePick {id:string;leaf:string;chain:string[]}
export interface MotaleViewerWindow {
  key:string;object:string|null;tracker:string|null;from:number;until:number;handback:number;
  range:[number,number]|null;step:number|null;turn:[number,number][];label:string|null;
  base:{from:number;until:number;handback:number;range:[number,number]|null;step:number|null};
}
export interface MotaleAct {
  id:string;title:string|null;start:number;end:number;state:string;revision:string|null;
  engine:string;threeD:boolean;objects:boolean;author:boolean;windows:boolean;renderAct:boolean;structure?:boolean;
}
export interface MotaleHello {
  protocol:'motale-bridge/0'|'motale-bridge/1'|'motale-bridge/2';film:string;transport:string[];crossOrigin:false;
  stage:{width:number;height:number;units?:string};time?:string;acts:MotaleAct[];
  props:Record<'x'|'y'|'scale'|'rotate'|'opacity'|'color'|'visible',{type:'number'|'color'|'boolean';unit?:string;default:number|string|boolean|null;min?:number;max?:number}>;
  authorSchema:'motale-author/0'|'motale-author/1'|'motale-author/2';events:(keyof MotaleBridgeEvents)[];
}
export interface MotaleProblem {code:string;path:string;message:string}
export interface MotaleBridgeEvents {
  select:{act:string|null;t:number;point:{x:number;y:number};hit:MotalePick|null;shift:boolean};
  'takeover-start':{act:string|null;key:string|null;t:number;branch:string};
  'takeover-end':{act:string|null;key:string|null;t:number;branch:string;commit:string|null};
  param:{branch:string;actions:{type:string;payload:unknown}[]};
  branch:{from:string;to:string};author:{revision:number;preview:boolean};mode:{mode:'viewer'|'author'};
}
export interface MotaleRenderOptions {
  width?:number;canvas?:HTMLCanvasElement;parameters?:MotaleParameters;author?:MotaleAuthor|null;
  playback?:'playing'|'paused';signal?:AbortSignal;
}
export interface MotaleRenderResult {canvas:HTMLCanvasElement;actId:string;t:number;width:number;height:number;caption:string|null;authorRevision:number}
export interface MotaleObjectClipboard {
  schema:'motale-clip/1';film:string;act:string;revision:string|null;engine:string;
  roots:{source:string;objects:Record<string,FilmMotaleObject>;removed:string[]}[];
}
export interface MotaleStructure {
  copy(act:string,ids:string[],options?:{author?:MotaleAuthor|null}):MotaleObjectClipboard;
  paste(act:string,clip:MotaleObjectClipboard,options:{author?:MotaleAuthor|null;prefix:string}):{author:MotaleAuthor;roots:string[];idMap:Record<string,string>};
  remove(act:string,ids:string[],options?:{author?:MotaleAuthor|null}):{author:MotaleAuthor};
}
export interface MotaleBridge {
  structure?:MotaleStructure;
  protocol:MotaleHello['protocol'];
  hello():MotaleHello;
  objects(act:string,t:number,options?:{all?:boolean;parts?:boolean;author?:false;parameters?:MotaleParameters}):MotaleBridgeObject[];
  objectAt(act:string,t:number,point:{x:number;y:number},options?:{parameters?:MotaleParameters}):MotalePick|null;
  regions(act:string,t:number,options?:{parameters?:MotaleParameters;author?:MotaleAuthor|null}):{key:string;object:string|null;at:[number,number];radius:number;bounds:MotaleBox}[];
  windows(act:string):MotaleViewerWindow[];
  author:{
    get():MotaleAuthor|null;
    set(doc:MotaleAuthor|null,options?:{lenient?:boolean}):{revision:number;warnings:MotaleProblem[]};
    preview(doc:MotaleAuthor|null,options?:{lenient?:boolean}):{revision:number;warnings:MotaleProblem[]};
    cancelPreview():{revision:number};
    reset():{revision:number;warnings:MotaleProblem[]};
    check(doc:MotaleAuthor|null):MotaleProblem[];
  };
  mode(value?:'viewer'|'author'):'viewer'|'author';
  on<K extends keyof MotaleBridgeEvents>(type:K,listener:(event:MotaleBridgeEvents[K])=>void):()=>void;
  renderAct(act:string,t:number,options?:MotaleRenderOptions):Promise<MotaleRenderResult>;
  captionTrack?():{act:string;t0:number;t1:number;text:string}[];
  state():{time:number;playing:boolean;activeBranch:string;mode:'viewer'|'author';authorRevision:number;previewing:boolean};
  dispose():void;
}
/** Normalize runtime capabilities while retaining saved schema and IDs.
 * v2 explicitly accepts unmodified v1 author documents. */
export type MotaleRawHello=Omit<MotaleHello,'acts'|'props'>&{acts:(Omit<MotaleAct,'author'>&{author?:boolean})[];props?:MotaleHello['props']};
export type MotaleRawObject=Omit<MotaleBridgeObject,'text'|'drawn'|'editable'|'props'>&Partial<Pick<MotaleBridgeObject,'text'|'drawn'|'editable'|'props'>>;
export type MotaleRawBridge=Omit<MotaleBridge,'hello'|'objects'>&{hello():MotaleRawHello;objects(act:string,t:number,options?:{all?:boolean;parts?:boolean;author?:false;parameters?:MotaleParameters}):MotaleRawObject[]};
export interface MotaleContext {
  bridge:MotaleBridge;hello:MotaleHello;act:MotaleAct;time:number;sourceTime:number;
  /** The actual iframe bridge reference; changes on reload, even for the same film. */
  instance:MotaleRawBridge;error?:string;
}
const failure=(code:string,message:string)=>Object.assign(new Error(message),{name:'BridgeError',code});

/** Film times are already retimed by filmFrame. This is the sole act-local conversion. */
export function motaleActAt(hello:MotaleHello,sourceTime:number):MotaleAct|undefined {
  return hello.acts.find(act=>sourceTime>=act.start&&sourceTime<act.end)
    ?? (sourceTime===hello.acts.at(-1)?.end?hello.acts.at(-1):undefined);
}
export function assertMotaleIdentity(author:MotaleAuthor|null,hello:MotaleHello) {
  if(!author)return;
  if(author.schema!==hello.authorSchema&&!(hello.authorSchema==='motale-author/2'&&author.schema==='motale-author/1'))throw failure('E_BAD_AUTHOR','作者数据版本与场景桥接不兼容，未自动转换格式或对象 ID');
  if(author.film!==undefined&&author.film!==hello.film)throw failure('E_STALE','场景作者数据属于另一部影片，已停止自动恢复');
  for(const [id,value]of Object.entries(author.acts)){
    const act=hello.acts.find(item=>item.id===id);
    if(!act||value.revision!==undefined&&value.revision!==act.revision)throw failure('E_STALE',`场景 ${id} 已重新生成，已停止自动恢复作者数据`);
  }
}

// Kept local to the bridge adapter: v0 has no sampled per-object props API.
function legacyValue(value:unknown,time:number):unknown{
  if(!value||typeof value!=='object'||!('keys'in value)||!Array.isArray(value.keys))return value;
  const keys=value.keys as [number,unknown,string?][];if(!keys.length)return undefined;
  if(time<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(time<keys[i][0]){const a=keys[i-1],b=keys[i];if(a[2]==='step'||typeof a[1]!=='number'||typeof b[1]!=='number')return a[1];let u=(time-a[0])/(b[0]-a[0]);if(a[2]==='smooth')u=u*u*(3-2*u);return a[1]+(b[1]-a[1])*u;}
  return keys.at(-1)![1];
}

/** One owner per mounted iframe. No document writes and no audience-state serialization. */
export class MotaleBridgeSession {
  readonly hello:MotaleHello;
  readonly bridge:MotaleBridge;
  private disposed=false;
  private generation=0;
  private frameGeneration=0;
  private sourceTime=0;
  private authorSignature:string|undefined;
  private authorDepth=0;
  private ownRevisions=new Set<number>();
  private subscriptions=new Set<()=>void>();
  private requests=new Set<AbortController>();
  private error?:string;
  private externalAuthorChange=false;
  private shownAuthor:MotaleAuthor|null=null;
  constructor(readonly instance:MotaleRawBridge,private current:()=>boolean,private notify:(type:string,data:Record<string,unknown>)=>void,private status:(message:string)=>void,private deadlineMs=10000){
    const hello=instance.hello(),v1=hello.protocol!=='motale-bridge/0';
    this.hello={...hello,props:hello.props??{} as MotaleHello['props'],acts:hello.acts.map(act=>({...act,author:v1?act.objects:!!act.author}))};
    if(!['motale-bridge/0','motale-bridge/1','motale-bridge/2'].includes(this.hello.protocol)||instance.protocol!==this.hello.protocol||this.hello.authorSchema!==hello.protocol.replace('bridge','author')||this.hello.crossOrigin!==false||!this.hello.transport.includes('direct')||!this.hello.acts.every(act=>Number.isFinite(act.start)&&Number.isFinite(act.end)&&act.end>act.start))
      throw failure('E_UNSUPPORTED','场景未提供兼容的同源桥接协议');
    if(this.hello.acts.some(act=>act.structure)&&(!instance.structure||!['copy','paste','remove'].every(key=>typeof instance.structure?.[key as keyof MotaleStructure]==='function')))
      throw failure('E_UNSUPPORTED','场景未提供完整的对象结构接口');
    this.shownAuthor=instance.author.get();
    const call=<T>(fn:()=>T):T=>{this.alive();return fn();};
    const authorCall=<T extends {revision:number}>(fn:()=>T):T=>{
      this.alive();this.generation++;this.cancelRequests();this.authorDepth++;
      try{const result=fn();this.ownRevisions.add(result.revision);if(this.ownRevisions.size>32)this.ownRevisions.delete(this.ownRevisions.values().next().value!);return result;}
      finally{this.authorDepth--;}
    };
    const checked=(doc:MotaleAuthor|null)=>{if(this.externalAuthorChange)throw failure('E_STALE',this.error!);assertMotaleIdentity(doc,this.hello);return doc;};
    const showing=<T>(doc:MotaleAuthor|null,fn:()=>T):T=>{const previous=this.shownAuthor;this.shownAuthor=structuredClone(doc);try{return fn();}catch(error){this.shownAuthor=previous;throw error;}};
    this.bridge={
      protocol:this.hello.protocol,hello:()=>call(()=>this.hello),
      objects:(act,time,options={})=>call(()=>{
        const query=v1?{parts:options.parts??options.all,author:options.author,parameters:options.parameters}:{all:options.all??options.parts,author:options.author,parameters:options.parameters};
        return instance.objects(act,time,query).map(object=>{
          if(v1){const props=object.props??{},text=props.text?.value??props.tex?.value;return{...object,props,editable:Object.keys(props).length>0,text:typeof text==='string'?text:null,drawn:object.bounds?'vector' as const:'canvas' as const};}
          const authored=options.author===false?undefined:this.shownAuthor?.acts[act]?.objects?.[object.id];
          const props:Record<string,MotalePropState>={};if(object.editable)for(const [name,spec]of Object.entries(this.hello.props)){const value=legacyValue(authored?.[name as keyof typeof authored],time);props[name]={type:spec.type,unit:spec.unit,min:spec.min,max:spec.max,keyable:true,base:spec.default,value:value===undefined?spec.default:value};}
          return{...object,props,editable:!!object.editable,text:object.text??null,drawn:object.drawn??'vector'};
        });
      }),objectAt:(...args)=>call(()=>instance.objectAt(...args)),
      regions:(...args)=>call(()=>instance.regions(...args)),windows:(...args)=>call(()=>instance.windows(...args)),
      author:{
        get:()=>call(()=>instance.author.get()),
        set:(doc,options)=>authorCall(()=>showing(checked(doc),()=>instance.author.set(doc,options))),
        preview:(doc,options)=>authorCall(()=>showing(checked(doc),()=>instance.author.preview(doc,options))),
        cancelPreview:()=>authorCall(()=>showing(instance.author.get(),()=>instance.author.cancelPreview())),
        reset:()=>authorCall(()=>showing(null,()=>instance.author.reset())),
        check:doc=>call(()=>{checked(doc);return instance.author.check(doc);}),
      },
      ...(instance.structure&&hello.protocol==='motale-bridge/2'?{structure:{
        copy:(act:string,ids:string[],options?:{author?:MotaleAuthor|null})=>call(()=>{checked(options?.author===undefined?instance.author.get():options.author);return instance.structure!.copy(act,ids,options);}),
        paste:(act:string,clip:MotaleObjectClipboard,options:{author?:MotaleAuthor|null;prefix:string})=>call(()=>{checked(options.author===undefined?instance.author.get():options.author);const result=instance.structure!.paste(act,clip,options);checked(result.author);return result;}),
        remove:(act:string,ids:string[],options?:{author?:MotaleAuthor|null})=>call(()=>{checked(options?.author===undefined?instance.author.get():options.author);const result=instance.structure!.remove(act,ids,options);checked(result.author);return result;}),
      }}:{}),
      mode:value=>call(()=>instance.mode(value)),state:()=>call(()=>instance.state()),
      on:(type,listener)=>this.subscribe(type,listener),renderAct:(act,time,options)=>this.renderAct(act,time,options),
      ...(instance.captionTrack?{captionTrack:()=>call(()=>instance.captionTrack!())}:{}),
      dispose:()=>this.dispose(),
    };
    this.subscribe('select',event=>{
      const context=this.context();
      if(!context||this.error||instance.mode()!=='author'||event.act!==context.act.id||Math.abs(event.t-context.time)>1e-5)return;
      this.notify('motale-select',{...event,instance});
    });
    this.subscribe('author',event=>{
      // Bridge emits synchronously BEFORE set/preview returns its revision.
      // Depth is therefore required in addition to remembered revisions.
      const own=this.authorDepth>0||this.ownRevisions.has(event.revision);
      if(!own){
        this.externalAuthorChange=true;this.error='场景作者状态已在外部更改，请重新打开素材后再编辑';
        this.generation++;this.cancelRequests();this.instance.mode('viewer');
        if(this.instance.state().previewing)this.bridge.author.cancelPreview();
        this.status(this.error);
      }
      this.notify('motale-author',{...event,own,instance,error:this.error});
    });
  }
  private alive(){if(this.disposed||!this.current())throw failure('E_DISPOSED','场景实例已更换，请重新选择');}
  private subscribe<K extends keyof MotaleBridgeEvents>(type:K,listener:(event:MotaleBridgeEvents[K])=>void):()=>void{
    this.alive();
    const stop=this.instance.on(type,event=>{if(!this.disposed&&this.current())listener(event);});
    const remove=()=>{stop();this.subscriptions.delete(remove);};
    this.subscriptions.add(remove);return remove;
  }
  context():MotaleContext|undefined{
    if(this.disposed||!this.current())return;
    const act=motaleActAt(this.hello,this.sourceTime);if(!act)return;
    return {bridge:this.bridge,hello:this.hello,act,time:Math.max(0,Math.min(act.end-act.start,this.sourceTime-act.start)),sourceTime:this.sourceTime,instance:this.instance,error:this.error};
  }
  prepare(sourceTime:number,author?:MotaleAuthor){
    this.alive();
    if(!Number.isFinite(sourceTime)||sourceTime<0)throw failure('E_BAD_VALUE','场景时间无效');
    if(sourceTime!==this.sourceTime){this.frameGeneration++;this.sourceTime=sourceTime;this.cancelRequests();}
    if(this.externalAuthorChange)return;
    const signature=JSON.stringify(author??null);
    if(signature===this.authorSignature)return;
    this.authorSignature=signature;this.generation++;this.cancelRequests();
    try{
      assertMotaleIdentity(author??null,this.hello);
      const problems=this.instance.author.check(author??null);
      if(problems.length)throw failure(problems[0].code,problems.map(problem=>problem.message).join('；'));
      this.bridge.author.set(author??null);this.error=undefined;
    }catch(error){
      this.error=error instanceof Error?error.message:String(error);
      // A previously restored value must not remain visible after a failed replacement.
      try{this.bridge.author.reset();this.instance.mode('viewer');}catch{}
      this.status(this.error);
    }
  }
  setAuthorMode(enabled:boolean){
    const context=this.context(),allowed=enabled&&!this.error&&context?.act.state==='ok'&&context.act.author&&context.act.objects;
    if(!this.disposed&&this.current()){
      if(!allowed&&this.instance.mode()==='author'&&this.instance.state().previewing)this.bridge.author.cancelPreview();
      this.instance.mode(allowed?'author':'viewer');
    }
  }
  private cancelRequests(){for(const request of this.requests)request.abort();}
  private async renderAct(act:string,time:number,options:MotaleRenderOptions={}):Promise<MotaleRenderResult>{
    this.alive();
    if(!Number.isFinite(time)||!Number.isFinite(options.width??1280)||(options.width??1280)<1||(options.width??1280)>4096)throw failure('E_BAD_VALUE','场景渲染尺寸或时间无效');
    if(options.author)assertMotaleIdentity(options.author,this.hello);
    const controller=new AbortController(),generation=this.generation,frameGeneration=this.frameGeneration;
    this.requests.add(controller);
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)controller.abort();
    const timer=setTimeout(abort,this.deadlineMs);
    const revision=this.instance.state().authorRevision;
    let rejectAbort:()=>void=()=>{};
    const aborted=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(failure('E_ABORTED','场景渲染已取消或超时'));controller.signal.addEventListener('abort',rejectAbort,{once:true});if(controller.signal.aborted)rejectAbort();});
    try{
      const result=await Promise.race([this.instance.renderAct(act,time,{...options,signal:controller.signal}),aborted]);
      this.alive();
      if(generation!==this.generation||frameGeneration!==this.frameGeneration||this.instance.state().authorRevision!==revision)throw failure('E_STALE','场景已改变，丢弃迟到的渲染结果');
      const chapter=this.hello.acts.find(item=>item.id===act),expected=chapter?Math.max(0,Math.min(chapter.end-chapter.start,time)):NaN;
      if(result.actId!==act||result.t!==expected||result.authorRevision!==revision)throw failure('E_STALE','场景返回了不同帧或修订版本');
      return result;
    }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',rejectAbort);this.requests.delete(controller);}
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.generation++;this.cancelRequests();
    for(const remove of [...this.subscriptions])remove();
    try{this.instance.dispose();}catch{}
  }
}
