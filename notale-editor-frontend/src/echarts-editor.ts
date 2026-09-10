import {chartAuthoringSchema,chartKinds,chartNames,newChart,cleanChartReferences,chartAtState,type ChartAuthoring,type ChartKind,type ChartSelection,type NativeChartInspection,type Slide,type Command} from '@notale/editor/browser';

type Context={documentId:()=>string;slide:()=>Slide;selection:()=>string[];locked:()=>boolean;inspect:()=>Promise<NativeChartInspection>;send:(type:string,data:unknown)=>void;select:(id:string)=>void;format:()=>void;commands:(commands:Command[])=>Promise<unknown>;commit:(target:string,before:ChartAuthoring,after:ChartAuthoring)=>Promise<void>;error:(error:unknown)=>void;step:()=>number;setStep:(step:number)=>void};
const uid=()=>crypto.randomUUID();
const icon=(text:string,label:string)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.title=label;b.setAttribute('aria-label',label);return b;};
const groups:[string,ChartKind[]][]=[['常用',['column','bar','line','area','pie','doughnut']],['组合与比较',['combo','stacked','percent','stacked-area','waterfall','rose']],['统计',['scatter','bubble','histogram','boxplot','radar','heatmap']],['结构与流程',['tree','treemap','sunburst','graph','sankey','funnel','gauge']]];
export function createEchartsEditor(ctx:Context){
  let target='',model:ChartAuthoring|undefined,part:ChartSelection={kind:'chart'},key='',stepState:string|undefined;
  let grid:any,gridLoaded:Promise<void>|undefined,focused={row:0,column:0},edgeMode=false,composition=false;
  let buffer:Record<string,unknown>[]|undefined,bufferError='',write=Promise.resolve(),selectionGeneration=0;
  const cache=new Map<string,ChartAuthoring>(),unsent=new Map<string,ChartAuthoring>();
  const panel=document.createElement('section');panel.id='echarts-inspector';panel.hidden=true;panel.className='chart-inspector';
  document.getElementById('selection-name')!.after(panel);
  const dock=document.createElement('section');dock.id='chart-data-dock';dock.hidden=true;dock.className='chart-data-dock';dock.setAttribute('aria-label','图表数据');
  dock.innerHTML='<div class="chart-data-resizer" role="separator" aria-label="调整数据面板高度" tabindex="0"></div><div class="chart-data-toolbar"><strong>图表数据</strong><div class="chart-data-actions"></div><button class="chart-data-close" aria-label="收起图表数据" title="收起图表数据">×</button></div><div class="chart-data-bindings"></div><div class="chart-data-grid"></div><p class="chart-data-status" role="status"></p>';
  const viewport=document.getElementById('canvas-viewport')!;viewport.after(dock);
  const message=dock.querySelector<HTMLElement>('.chart-data-status')!,bindings=dock.querySelector<HTMLElement>('.chart-data-bindings')!;
  const gallery=document.createElement('dialog');gallery.id='chart-type-gallery';gallery.className='chart-gallery';gallery.setAttribute('aria-label','选择图表类型');document.body.append(gallery);
  let galleryMode:'insert'|'change'='insert',savedViewport:{left:number;top:number}|undefined;
  const status=(text:string)=>{message.textContent=text;message.classList.toggle('is-error',!!bufferError);};
  const error=(e:unknown)=>{bufferError=e instanceof Error?e.message:String(e);status(bufferError);};
  const button=(parent:HTMLElement,text:string,action:()=>unknown)=>{const b=icon(text,text);b.onclick=()=>{try{Promise.resolve(action()).catch(ctx.error);}catch(e){ctx.error(e);}};parent.append(b);return b;};
  const field=(parent:HTMLElement,label:string,value:unknown,change:(value:any)=>void,options?:Record<string,string>|'number'|'color'|'checkbox')=>{
    const wrap=document.createElement('label');wrap.className='chart-field';const title=document.createElement('span');title.textContent=label;wrap.append(title);
    let input:HTMLInputElement|HTMLSelectElement;
    if(options&&typeof options==='object'){input=document.createElement('select');for(const [key,name] of Object.entries(options))input.add(new Option(name,key));}
    else{input=document.createElement('input');input.type=options??'text';if(options==='number'){input.step='any';input.placeholder='自动';}}
    input.setAttribute('aria-label',label);if(options==='checkbox')(input as HTMLInputElement).checked=!!value;else input.value=value==null?'':String(value);
    input.addEventListener('compositionstart',()=>composition=true);input.addEventListener('compositionend',()=>composition=false);
    input.onchange=()=>{if(composition)return;change(options==='checkbox'?(input as HTMLInputElement).checked:options==='number'?input.value===''?null:Number(input.value):input.value);};
    wrap.append(input);parent.append(wrap);return input;
  };
  const section=(title:string,open=false)=>{const d=document.createElement('details');d.className='chart-properties';d.open=open;const s=document.createElement('summary');s.textContent=title;d.append(s);panel.append(d);return d;};
  function currentKey(){return [ctx.documentId(),ctx.slide().id,target].join(':');}
  function preview(){if(model)ctx.send('chart-draft',{target,model,stepState});}
  function save(next:ChartAuthoring,refresh=false){
    if(!model||ctx.locked())return;
    try{
      next=chartAuthoringSchema.parse(cleanChartReferences(next));const before=structuredClone(model);
      if(JSON.stringify(before)===JSON.stringify(next))return;
      model=next;cache.set(currentKey(),structuredClone(next));unsent.set(currentKey(),structuredClone(next));preview();
      const id=target;write=write.catch(()=>{}).then(()=>ctx.commit(id,before,next));void write.then(()=>{if(unsent.get(currentKey())===next)unsent.delete(currentKey());}).catch(ctx.error);
      bufferError='';status('');if(refresh){renderProperties();renderGrid();}
    }catch(e){error(e);}
  }
  function edit(action:(next:ChartAuthoring)=>void,refresh=false){if(!model)return;const next=structuredClone(model);action(next);save(next,refresh);}
  function styleEdit(action:(next:ChartAuthoring)=>void){
    if(!model)return;
    if(!stepState){edit(action);return;}
    edit(next=>{const base=chartAtState(next,[stepState!]);action(base);const state=next.states.find(s=>s.id===stepState)!;state.appearance=Object.fromEntries(Object.entries(base.appearance).filter(([k,v])=>JSON.stringify(v)!==JSON.stringify(next.appearance[k as keyof typeof next.appearance])));state.kind=base.kind!==next.kind?base.kind:undefined;state.xAxis=base.xAxis;state.yAxis=base.yAxis;state.series=Object.fromEntries(base.series.map(s=>[s.id,s.style]));state.hiddenRows=base.hiddenRows;state.annotations=base.annotations.filter(a=>!a.hidden).map(a=>a.id);});
  }
  function seriesStyle(){return model?.series.find(s=>s.id===part.seriesId)??model?.series[0];}
  function modifySeries(property:string,value:any){styleEdit(next=>{const series=next.series.find(s=>s.id===part.seriesId)??next.series[0];const style=part.kind==='point'&&part.rowId?(series.points[part.rowId]??={}):series.style;(style as any)[property]=value;});}
  function selectPart(next:ChartSelection){
    if(next.kind==='series'&&part.seriesId===next.seriesId&&next.rowId){next={...next,kind:'point'};}
    part=next;renderProperties();ctx.format();if(model&&next.rowId){const row=model.rows.findIndex(r=>r.id===next.rowId);if(row>=0){focused.row=row;void grid?.scrollToRow?.(row);}}
    ctx.send('chart-selection',{target,selection:part});
  }
  function renderProperties(){
    if(!model)return;panel.replaceChildren();
    if(stepState){const bar=document.createElement('div');bar.className='chart-step-scope';bar.textContent=`正在编辑：${model.states.find(s=>s.id===stepState)?.name??'教学步骤'}`;button(bar,'返回基础图表',()=>{stepState=undefined;preview();renderProperties();});panel.append(bar);}
    const objects:Record<string,string>={chart:'整个图表',title:'标题',legend:'图例',xAxis:'横坐标轴',yAxis:'纵坐标轴'};
    for(const s of model.series)objects[`series:${s.id}`]=`系列：${s.name}`;
    for(const a of model.annotations)objects[`annotation:${a.id}`]=`标注：${a.text||'未命名'}`;
    const selectionKey=part.kind==='series'||part.kind==='point'?`series:${part.seriesId}`:part.kind==='annotation'?`annotation:${part.annotationId}`:part.kind;
    field(panel,'所选内容',selectionKey,value=>{const [kind,id]=value.split(':');selectPart({kind,seriesId:kind==='series'?id:undefined,annotationId:kind==='annotation'?id:undefined});},objects);
    if(part.kind==='point'){const note=document.createElement('p');note.className='hint';note.textContent=`数据点：${model.rows.find(r=>r.id===part.rowId)?.values[model.bindings.label]??''}`;panel.append(note);}
    const actions=document.createElement('div');actions.className='chart-primary-actions';button(actions,'编辑数据',openData);button(actions,'更改类型',()=>openGallery('change'));panel.append(actions);
    const shown=stepState?chartAtState(model,[stepState]):model;
    if(['chart','title'].includes(part.kind)){
      const group=section('标题与文字',true);
      for(const [label,key] of [['标题','title'],['副标题','subtitle'],['字体','fontFamily']] as const)field(group,label,shown.appearance[key]??'',v=>styleEdit(n=>n.appearance[key]=v));
      field(group,'字号',shown.appearance.fontSize??16,v=>styleEdit(n=>n.appearance.fontSize=v),'number');field(group,'文字颜色',shown.appearance.textColor??'#374151',v=>styleEdit(n=>n.appearance.textColor=v),'color');
    }
    if(['chart','legend'].includes(part.kind)){
      const g=section('布局与配色',part.kind==='legend');field(g,'图例',shown.appearance.legend??'auto',v=>styleEdit(n=>n.appearance.legend=v),{auto:'自动',none:'隐藏',top:'上方',bottom:'下方',left:'左侧',right:'右侧'});
      field(g,'背景',shown.appearance.background??'#ffffff',v=>styleEdit(n=>n.appearance.background=v),'color');field(g,'绘图区边距',shown.appearance.margin??50,v=>styleEdit(n=>n.appearance.margin=v),'number');
      const palettes=[['#7c5ce7','#39a7a0','#f2ad5e','#dc668e','#6c92d4'],['#3e73ba','#6ca0d6','#b4d5ed','#dc914c','#ddbd83'],['#269a91','#62b2a8','#a4d1bc','#d4c788','#d58b61']];const swatches=document.createElement('div');swatches.className='chart-palettes';palettes.forEach((colors,i)=>{const b=button(swatches,`配色 ${i+1}`,()=>styleEdit(n=>n.appearance.palette=colors));b.replaceChildren(...colors.map(c=>{const s=document.createElement('span');s.style.background=c;return s;}));});g.append(swatches);
    }
    if(part.kind==='series'||part.kind==='point'){
      const s=shown.series.find(s=>s.id===part.seriesId)??shown.series[0],st=part.kind==='point'&&part.rowId?{...s.style,...s.points[part.rowId]}:s.style,g=section('外观',true);
      if(part.kind==='series'){field(g,'系列名称',s.name,v=>edit(n=>{n.series.find(t=>t.id===s.id)!.name=v;}));if(shown.kind==='combo')field(g,'绘制为',s.type??'bar',v=>edit(n=>{n.series.find(t=>t.id===s.id)!.type=v;}),{bar:'柱形',line:'折线'});field(g,'坐标轴',s.axis,v=>edit(n=>{n.series.find(t=>t.id===s.id)!.axis=v;}),{primary:'主坐标轴',secondary:'次坐标轴'});}
      field(g,'颜色',st.color??shown.appearance.palette?.[shown.series.indexOf(s)]??'#7c5ce7',v=>modifySeries('color',v),'color');field(g,'不透明度',st.opacity??1,v=>modifySeries('opacity',v),'number');
      field(g,'线宽',st.width??3,v=>modifySeries('width',v),'number');field(g,'线型',st.lineType??'solid',v=>modifySeries('lineType',v),{solid:'实线',dashed:'虚线',dotted:'点线'});field(g,'数据标记',st.symbol??'circle',v=>modifySeries('symbol',v),{circle:'圆形',rect:'方形',diamond:'菱形',triangle:'三角形',none:'隐藏'});field(g,'标记大小',st.symbolSize??7,v=>modifySeries('symbolSize',v),'number');field(g,'平滑曲线',st.smooth??false,v=>modifySeries('smooth',v),'checkbox');field(g,'显示数值',st.labels??false,v=>modifySeries('labels',v),'checkbox');field(g,'标签位置',st.labelPosition??'top',v=>modifySeries('labelPosition',v),{top:'上方',inside:'内部',right:'右侧',outside:'外部'});
      button(g,'恢复继承样式',()=>edit(n=>{const s=n.series.find(s=>s.id===part.seriesId)!;if(part.kind==='point'&&part.rowId)delete s.points[part.rowId];else s.style={};},true));
      button(g,'添加标注',()=>addAnnotation(part.rowId?'point':'text'));
    }
    for(const key of ['xAxis','yAxis','secondaryAxis'] as const){if(!['chart',key].includes(part.kind)&&!(key==='secondaryAxis'&&part.kind==='yAxis'))continue;const g=section(key==='xAxis'?'横坐标轴':key==='yAxis'?'纵坐标轴':'次坐标轴',part.kind===key);const axis=shown[key];field(g,'轴标题',axis.name??'',v=>styleEdit(n=>n[key].name=v));field(g,'刻度类型',axis.type??(key==='xAxis'?'category':'value'),v=>styleEdit(n=>n[key].type=v),{category:'分类',value:'数值',time:'时间',log:'对数'});for(const [name,prop] of [['最小值','min'],['最大值','max'],['刻度间隔','interval'],['标签旋转','rotate']] as const)field(g,name,axis[prop],v=>styleEdit(n=>(n[key] as any)[prop]=v),'number');field(g,'逆序',axis.inverse??false,v=>styleEdit(n=>n[key].inverse=v),'checkbox');field(g,'网格线',axis.grid??key!=='xAxis',v=>styleEdit(n=>n[key].grid=v),'checkbox');}
    if(part.kind==='annotation'){
      const annotation=model.annotations.find(a=>a.id===part.annotationId);if(annotation){const g=section('标注',true);const change=(key:string,value:any)=>edit(n=>{Object.assign(n.annotations.find(a=>a.id===annotation.id)!,{[key]:value});});field(g,'文字',annotation.text,v=>change('text',v));for(const [label,key] of [['横向位置','x'],['纵向位置','y'],['宽度','width'],['字号','fontSize']] as const)field(g,label,annotation[key],v=>change(key,v),'number');field(g,'颜色',annotation.color,v=>change('color',v),'color');if(annotation.kind==='area')field(g,'结束位置',annotation.end,v=>change('end',v),'number');button(g,'删除标注',()=>{edit(n=>{n.annotations=n.annotations.filter(a=>a.id!==annotation.id);},true);part={kind:'chart'};renderProperties();});}
    }
    const numbers=section('数值与提示');field(numbers,'小数位',shown.appearance.precision??0,v=>styleEdit(n=>n.appearance.precision=v),'number');field(numbers,'前缀',shown.appearance.prefix??'',v=>styleEdit(n=>n.appearance.prefix=v));field(numbers,'单位',shown.appearance.suffix??'',v=>styleEdit(n=>n.appearance.suffix=v));field(numbers,'千位分隔',shown.appearance.thousands??false,v=>styleEdit(n=>n.appearance.thousands=v),'checkbox');field(numbers,'标签内容',shown.appearance.labelContent??'value',v=>styleEdit(n=>n.appearance.labelContent=v),{value:'数值',name:'名称',percent:'百分比','name-value':'名称与数值'});field(numbers,'演示时显示提示',shown.appearance.tooltip!==false,v=>styleEdit(n=>n.appearance.tooltip=v),'checkbox');
    if(shown.kind==='histogram')field(numbers,'分箱数',shown.appearance.bins,v=>styleEdit(n=>{if(v===null)delete n.appearance.bins;else n.appearance.bins=v;}),'number');
    if(shown.kind==='heatmap'){field(numbers,'色标',shown.appearance.colorScale??'continuous',v=>styleEdit(n=>n.appearance.colorScale=v),{continuous:'连续',piecewise:'分段'});field(numbers,'低值颜色',shown.appearance.colorLow??'#e8e1fc',v=>styleEdit(n=>n.appearance.colorLow=v),'color');field(numbers,'高值颜色',shown.appearance.colorHigh??'#7350d2',v=>styleEdit(n=>n.appearance.colorHigh=v),'color');}
    const annotations=section('标注与参考');button(annotations,'文字标注',()=>addAnnotation('text'));button(annotations,'参考线',()=>addAnnotation('line'));button(annotations,'参考区域',()=>addAnnotation('area'));
    const teaching=section('分步讲授');button(teaching,'添加下一步',addStep);for(const state of model.states)button(teaching,state.name,()=>{stepState=state.id;preview();renderProperties();});if(stepState){button(teaching,'突出所选系列',()=>{edit(n=>{n.states.find(s=>s.id===stepState)!.emphasis=[part.seriesId??n.series[0].id];});});button(teaching,'显示所选系列',()=>modifySeries('hidden',false));button(teaching,'隐藏所选系列',()=>modifySeries('hidden',true));}
    const transfer=section('导出与恢复');button(transfer,'导出 PNG',()=>ctx.send('chart-export',{target,format:'png'}));button(transfer,'导出 SVG',()=>ctx.send('chart-export',{target,format:'svg'}));button(transfer,'恢复默认外观',()=>{edit(n=>{n.appearance={title:n.appearance.title};n.xAxis={};n.yAxis={};n.secondaryAxis={};n.series.forEach(s=>{s.style={};s.points={};});},true);});
    if(ctx.slide().nativeCharts[target]?.source)button(transfer,'恢复动态数据',()=>edit(n=>n.origin='native',true));
    if(ctx.locked())for(const control of panel.querySelectorAll<HTMLInputElement>('input,select,button'))control.disabled=true;
  }
  function addAnnotation(kind:'text'|'point'|'line'|'area'){
    const id=uid();edit(n=>{n.annotations.push({id,kind,text:kind==='line'?'参考值':kind==='area'?'关注区域':'在此输入标注',rowId:kind==='point'?part.rowId:undefined,seriesId:part.seriesId,x:kind==='area'?0:45,y:kind==='line'?80:25,end:kind==='area'?1:undefined,color:'#7c5ce7',fontSize:16,width:180});if(stepState){n.states.find(s=>s.id===stepState)!.annotations=n.annotations.map(a=>a.id);}},true);part={kind:'annotation',annotationId:id};renderProperties();
  }
  async function addStep(){
    if(!model)return;const stateId=uid(),slide=ctx.slide(),index=(slide.steps?.length??Math.max(1,ctx.step()+1));
    const state={id:stateId,name:`步骤 ${index}`,series:{},annotations:model.annotations.filter(a=>!a.hidden).map(a=>a.id)};
    const next=structuredClone(model);next.states.push(state);save(next);await write;
    await ctx.commands([{type:'step.initialize',slideId:slide.id},{type:'step.insert',slideId:slide.id,index,step:{id:uid(),name:state.name,notes:'',advanceAfter:null}},{type:'animation.set',slideId:slide.id,animation:{id:uid(),target,step:index,effect:'chart-state',chartStateId:stateId,trigger:'click',duration:500,delay:0,easing:'ease-out',dx:0,dy:0}}]);
    stepState=stateId;ctx.setStep(index);preview();renderProperties();
  }
  function openGallery(mode:'insert'|'change'){
    galleryMode=mode;gallery.replaceChildren();const header=document.createElement('header');const title=document.createElement('h2');title.textContent=mode==='insert'?'插入图表':'更改图表类型';header.append(title);button(header,'×',()=>gallery.close()).setAttribute('aria-label','关闭');gallery.append(header);
    for(const [name,kinds] of groups){const label=document.createElement('h3');label.textContent=name;gallery.append(label);const row=document.createElement('div');row.className='chart-type-grid';for(const kind of kinds){const b=button(row,chartNames[kind],()=>chooseType(kind));b.className='chart-type-card';b.setAttribute('aria-pressed',String(mode==='change'&&model?.kind===kind));const picture=document.createElement('div');picture.className=`chart-mini chart-mini-${kind}`;picture.innerHTML=['pie','doughnut','rose','sunburst'].includes(kind)?'<i class="chart-mini-circle"></i>':['line','area','stacked-area'].includes(kind)?'<svg viewBox="0 0 100 50" aria-hidden="true"><path d="M5 42L30 24L50 32L75 10L95 17"/></svg>':'<i style="height:40%"></i><i style="height:75%"></i><i style="height:55%"></i><i style="height:90%"></i>';b.prepend(picture);}gallery.append(row);}
    gallery.showModal();
  }
  async function chooseType(kind:ChartKind){
    if(galleryMode==='insert'){const id=uid();await ctx.commands([{type:'native-chart.create',slideId:ctx.slide().id,target:id,model:newChart(kind),x:180,y:120,width:900,height:520}]);gallery.close();ctx.select(id);ctx.format();return;}
    if(!model)return;
    const family=(kind:ChartKind)=>['tree','treemap','sunburst'].includes(kind)?'hierarchy':['graph','sankey'].includes(kind)?'network':'table';
    if(family(model.kind)!==family(kind)){const hint=document.createElement('p');hint.className='chart-type-hint';hint.textContent='保留现有数据；请在数据表中设置父节点或连线。';gallery.querySelector('.chart-type-hint')?.remove();gallery.append(hint);}
    edit(n=>n.kind=kind,true);if(model.kind===kind)gallery.close();
  }
  async function loadGrid(){if(gridLoaded)return gridLoaded;gridLoaded=(async()=>{const {defineCustomElementRevoGrid}=await import('@revolist/revogrid/standalone');defineCustomElementRevoGrid();grid=document.createElement('revo-grid');grid.range=true;grid.rowHeaders=true;grid.resize=true;grid.rowSize=32;grid.headerRowSize=34;grid.useClipboard={rangeFill:true};grid.theme='compact';grid.style.height='100%';dock.querySelector('.chart-data-grid')!.append(grid);
    grid.addEventListener('beforecellfocusinit',(e:any)=>{focused={row:e.detail.rowIndex??0,column:e.detail.colIndex??0};});
    grid.addEventListener('afteredit',(e:any)=>{if(composition)return;buffer=(grid.source as any[]).map(row=>({...row}));applyBuffer();});
    grid.addEventListener('afterpasteapply',()=>{buffer=(grid.source as any[]).map(row=>({...row}));applyBuffer();});
    grid.addEventListener('compositionstart',()=>composition=true);grid.addEventListener('compositionend',()=>composition=false);
    grid.addEventListener('keydown',(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();return;}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='d'){event.preventDefault();event.stopPropagation();if(buffer&&focused.row>0){const cols=edgeMode?['source','target','value']:model!.columns.map(c=>c.id),col=cols[focused.column];buffer[focused.row][col]=buffer[focused.row-1][col];grid.source=buffer;applyBuffer();}}});
    grid.addEventListener('contextmenu',(e:MouseEvent)=>{e.preventDefault();e.stopPropagation();showDataMenu(e.clientX,e.clientY);});
  })();return gridLoaded;}
  function showDataMenu(x:number,y:number){document.getElementById('chart-grid-menu')?.remove();const menu=document.createElement('div');menu.id='chart-grid-menu';menu.className='chart-grid-menu';menu.style.left=`${Math.min(x,innerWidth-180)}px`;menu.style.top=`${Math.min(y,innerHeight-210)}px`;document.body.append(menu);const action=(name:string,fn:()=>void)=>button(menu,name,()=>{menu.remove();fn();});action('在下方插入行',addRow);action('删除当前行',()=>edit(n=>{if(edgeMode)n.edges.splice(focused.row,1);else{const removed=n.rows.splice(focused.row,1)[0];for(const r of n.rows)if(r.parentId===removed?.id)r.parentId=null;}},true));action('当前行上移',()=>edit(n=>{const rows=edgeMode?n.edges:n.rows;if(focused.row>0){[rows[focused.row-1],rows[focused.row]]=[rows[focused.row],rows[focused.row-1]];focused.row--; }},true));action('当前行下移',()=>edit(n=>{const rows=edgeMode?n.edges:n.rows;if(focused.row<rows.length-1){[rows[focused.row+1],rows[focused.row]]=[rows[focused.row],rows[focused.row+1]];focused.row++;}},true));setTimeout(()=>document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target as Node))menu.remove();},{once:true}),0);}
  function applyBuffer(){if(!model||!buffer)return;try{const next=structuredClone(model);
    if(edgeMode){next.edges=buffer.map((r,i)=>({id:String(r.__id??uid()),source:String(r.source??''),target:String(r.target??''),value:number(r.value,i,'流量')??0}));}
    else next.rows=buffer.map((r,i)=>({id:String(r.__id??uid()),parentId:r.__parent?String(r.__parent):null,values:Object.fromEntries(model!.columns.map(c=>[c.id,c.type==='number'?number(r[c.id],i,c.name):r[c.id]??'']))}));
    next.origin='manual';chartAuthoringSchema.parse(next);save(next);bufferError='';localStorage.removeItem('notale-chart-buffer:'+currentKey());status('');
  }catch(e){error(e);try{localStorage.setItem('notale-chart-buffer:'+currentKey(),JSON.stringify({edgeMode,buffer}));}catch{ctx.error(Error('数据草稿无法写入本机，请保持窗口打开'));}}}
  function number(value:unknown,row:number,name:string){if(value===null||String(value??'').trim()==='')return null;const raw=String(value).trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw Error(`第 ${row+1} 行「${name}」需要数字`);return Number(raw);}
  function renderGrid(){if(!grid||!model||dock.hidden)return;buffer=edgeMode?model.edges.map(e=>({__id:e.id,source:e.source,target:e.target,value:e.value})):model.rows.map(r=>({__id:r.id,__parent:r.parentId??'',...r.values}));
    grid.columns=edgeMode?[{prop:'source',name:'起点 ID',size:180},{prop:'target',name:'终点 ID',size:180},{prop:'value',name:'流量',size:140}]:[...(['tree','treemap','sunburst','graph','sankey'].includes(model.kind)?[{prop:'__id',name:'节点 ID',readonly:true,size:180},...(['tree','treemap','sunburst'].includes(model.kind)?[{prop:'__parent',name:'父节点 ID',size:180}]:[])]:[]),...model.columns.map(c=>({prop:c.id,name:c.name,size:c.type==='text'?190:150}))];grid.source=buffer;grid.readonly=ctx.locked();renderBindings();}
  function renderBindings(){bindings.replaceChildren();if(!model)return;const columns=Object.fromEntries(model.columns.map(c=>[c.id,c.name]));field(bindings,'分类',model.bindings.label,v=>edit(n=>n.bindings.label=v,true),columns);if(['scatter','bubble'].includes(model.kind)){field(bindings,'横轴',model.bindings.x,v=>edit(n=>n.bindings.x=v,true),columns);field(bindings,'纵轴',model.bindings.y,v=>edit(n=>n.bindings.y=v,true),columns);if(model.kind==='bubble')field(bindings,'大小',model.bindings.size,v=>edit(n=>n.bindings.size=v,true),columns);}if(['pie','doughnut','rose','funnel','gauge','tree','treemap','sunburst'].includes(model.kind))field(bindings,'数值系列',model.bindings.seriesId??model.series[0].id,v=>edit(n=>n.bindings.seriesId=v,true),Object.fromEntries(model.series.map(s=>[s.id,s.name])));if(['graph','sankey'].includes(model.kind))button(bindings,edgeMode?'编辑节点':'编辑连线',()=>{edgeMode=!edgeMode;renderGrid();});if(ctx.slide().nativeCharts[target]?.source&&model.origin==='native'){const hint=document.createElement('span');hint.className='hint';hint.textContent='当前由原图动态计算；修改表格后使用手工数据。';bindings.append(hint);}}
  async function openData(){if(!model)return;savedViewport={left:viewport.scrollLeft,top:viewport.scrollTop};dock.hidden=false;const saved=Number(localStorage.getItem('notale-chart-dock-height'));dock.style.height=`${Math.min(Math.max(saved||280,180),viewport.parentElement!.clientHeight*.5)}px`;await loadGrid();renderGrid();try{const raw=localStorage.getItem('notale-chart-buffer:'+currentKey());if(raw){const saved=JSON.parse(raw);buffer=saved.buffer;edgeMode=saved.edgeMode;grid.source=buffer;bufferError='上次的数据草稿尚未应用，请修正后继续';status(bufferError);}}catch{} }
  dock.querySelector<HTMLButtonElement>('.chart-data-close')!.onclick=()=>{dock.hidden=true;if(savedViewport)requestAnimationFrame(()=>viewport.scrollTo(savedViewport!.left,savedViewport!.top));};
  const resizer=dock.querySelector<HTMLElement>('.chart-data-resizer')!;resizer.onpointerdown=e=>{e.preventDefault();const start=e.clientY,height=dock.clientHeight;resizer.setPointerCapture(e.pointerId);resizer.onpointermove=event=>{const h=Math.max(180,Math.min(height+start-event.clientY,viewport.parentElement!.clientHeight*.5));dock.style.height=h+'px';};resizer.onpointerup=()=>{resizer.onpointermove=null;localStorage.setItem('notale-chart-dock-height',String(dock.clientHeight));};};
  const actions=dock.querySelector<HTMLElement>('.chart-data-actions')!;
  function addRow(){edit(n=>{if(edgeMode){if(n.rows.length>=2)n.edges.push({id:uid(),source:n.rows[0].id,target:n.rows[1].id,value:1});}else n.rows.splice(focused.row+1,0,{id:uid(),values:Object.fromEntries(n.columns.map(c=>[c.id,c.type==='number'?null:'新分类']))});},true);}
  button(actions,'＋ 行',addRow);button(actions,'＋ 系列',()=>edit(n=>{const id=uid();n.columns.push({id,name:`系列 ${n.series.length+1}`,type:'number'});n.series.push({id:uid(),columnId:id,name:`系列 ${n.series.length+1}`,axis:'primary',style:{},points:{}});n.rows.forEach(r=>r.values[id]=null);},true));
  button(actions,'导入表格',()=>file.click());button(actions,'恢复有效数据',()=>{bufferError='';localStorage.removeItem('notale-chart-buffer:'+currentKey());renderGrid();status('');});
  const file=document.createElement('input');file.type='file';file.accept='.csv,.tsv,.txt';file.hidden=true;dock.append(file);file.onchange=()=>{const f=file.files?.[0];if(f)void f.text().then(importTable).catch(error);file.value='';};
  async function importTable(text:string){const {readDelimitedRows}=await import('./chart-table-parser.js');const rows=readDelimitedRows(text);if(rows.length<2)throw Error('需要标题行和至少一行数据');const header=rows.shift()!;edit(n=>{n.columns=header.map((name,i)=>({id:n.columns[i]?.id??uid(),name:name||`列 ${i+1}`,type:i?'number':'text'}));n.series=n.columns.slice(1).map((c,i)=>({...n.series[i],id:n.series[i]?.id??uid(),columnId:c.id,name:c.name,axis:n.series[i]?.axis??'primary',style:n.series[i]?.style??{},points:n.series[i]?.points??{}}));n.bindings={label:n.columns[0].id,x:n.columns[1]?.id,y:n.columns[2]?.id??n.columns[1]?.id};n.rows=rows.map((r,i)=>({id:n.rows[i]?.id??uid(),values:Object.fromEntries(n.columns.map((c,j)=>[c.id,j?number(r[j],i,c.name):r[j]??'']))}));n.origin='manual';},true);}
  async function render(){
    const id=ctx.selection().length===1?ctx.selection()[0]:'';const chart=ctx.slide().nativeCharts[id];const nextKey=[ctx.documentId(),ctx.slide().id,id].join(':');
    if(nextKey===key){panel.hidden=!model;return;}key=nextKey;target=id;part={kind:'chart'};stepState=undefined;bufferError='';model=chart?.authoring?structuredClone(chart.authoring):undefined;const generation=++selectionGeneration;
    if(!id){panel.hidden=true;dock.hidden=true;return;}
    if(!model){try{const inspected=await ctx.inspect();if(generation!==selectionGeneration)return;if(inspected.available&&inspected.series.length&&inspected.series.every(s=>['line','bar','scatter','pie'].includes(s.type))){const next=newChart(inspected.series[0].type==='bar'?'column':inspected.series[0].type as ChartKind);next.origin='native';next.appearance.title=inspected.title??'';next.columns=[{id:'label',name:'分类',type:'text'},...inspected.series.map((s,i)=>({id:`value_${i}`,name:s.name||`系列 ${i+1}`,type:'number' as const}))];next.series=inspected.series.map((s,i)=>({id:`series_${i}`,name:s.name||`系列 ${i+1}`,columnId:`value_${i}`,axis:'primary',style:{color:/^#[\da-f]{6}$/i.test(s.color)?s.color:'#7c5ce7',width:s.width,labels:false},points:{}}));next.rows=Array.from({length:Math.max(...inspected.series.map(s=>s.data.length))},(_,i)=>({id:`row_${i}`,values:{label:inspected.labels?.[i]??String((inspected.series[0].data[i] as any)?.name??i+1),...Object.fromEntries(inspected.series.map((s,j)=>{const value=(s.data[i] as any)?.value??s.data[i];return [`value_${j}`,typeof value==='number'?value:null];}))}}));next.bindings={label:'label',x:'value_0',y:next.columns[2]?.id??'value_0'};model=next;}}catch{/* Non-chart selections have no chart inspector. */}}
    if(generation!==selectionGeneration)return;panel.hidden=!model;if(model){cache.set(key,structuredClone(model));renderProperties();if(!dock.hidden)renderGrid();}else dock.hidden=true;
  }
  return {render,openGallery:()=>openGallery('insert'),openData,selectPart,restore(next:ChartAuthoring){model=structuredClone(next);cache.set(currentKey(),model);preview();renderProperties();renderGrid();},async flush(){await write;if(bufferError)throw Error(bufferError);},model:()=>model,receive(type:string,data:any){if(type==='chart-selected'&&data.target===target)selectPart(data.selection);if(type==='chart-exported'&&data.url){const a=document.createElement('a');a.href=data.url;a.download=`图表.${data.format??'png'}`;a.click();}if(type==='chart-annotation'&&data.target===target)edit(n=>{Object.assign(n.annotations.find(a=>a.id===data.id)!,data.patch);});},pending:()=>unsent};
}
