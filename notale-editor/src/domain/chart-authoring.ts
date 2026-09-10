import { z } from 'zod';

export const chartKinds = ['bar','column','stacked','percent','line','area','stacked-area','combo','pie','doughnut','rose','scatter','bubble','histogram','boxplot','radar','heatmap','tree','treemap','sunburst','graph','sankey','funnel','gauge','waterfall'] as const;
export const chartNames: Record<typeof chartKinds[number], string> = {bar:'条形图',column:'柱状图',stacked:'堆积柱形图',percent:'百分比堆积图',line:'折线图',area:'面积图','stacked-area':'堆积面积图',combo:'柱线组合图',pie:'饼图',doughnut:'环形图',rose:'玫瑰图',scatter:'散点图',bubble:'气泡图',histogram:'直方图',boxplot:'箱线图',radar:'雷达图',heatmap:'热力图',tree:'树图',treemap:'矩形树图',sunburst:'旭日图',graph:'关系图',sankey:'桑基图',funnel:'漏斗图',gauge:'仪表盘',waterfall:'瀑布图'};
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const color = z.string().regex(/^#[a-fA-F0-9]{3,8}$/);
const scalar = z.union([z.string().max(4000),z.number().finite(),z.null()]);
export const chartRowSchema = z.object({id,values:z.record(id,scalar),parentId:id.nullable().optional()}).strict();
export const chartSeriesStyleSchema = z.object({color:color.optional(),opacity:z.number().min(0).max(1).optional(),width:z.number().min(0).max(30).optional(),lineType:z.enum(['solid','dashed','dotted']).optional(),symbol:z.enum(['circle','rect','triangle','diamond','none']).optional(),symbolSize:z.number().min(0).max(100).optional(),smooth:z.boolean().optional(),labels:z.boolean().optional(),labelPosition:z.enum(['top','inside','right','outside']).optional(),gradient:color.optional(),hidden:z.boolean().optional()}).strict();
export const chartAxisSchema = z.object({type:z.enum(['category','value','time','log']).optional(),name:z.string().max(200).optional(),min:z.number().finite().nullable().optional(),max:z.number().finite().nullable().optional(),interval:z.number().positive().nullable().optional(),inverse:z.boolean().optional(),rotate:z.number().min(-90).max(90).optional(),grid:z.boolean().optional(),labels:z.boolean().optional()}).strict().refine(a=>a.min==null||a.max==null||a.min<a.max,'坐标轴最小值必须小于最大值');
export const chartAppearanceSchema = z.object({title:z.string().max(1000).optional(),subtitle:z.string().max(2000).optional(),fontFamily:z.string().max(300).optional(),fontSize:z.number().min(8).max(100).optional(),textColor:color.optional(),background:color.optional(),palette:z.array(color).min(1).max(100).optional(),legend:z.enum(['auto','none','top','bottom','left','right']).optional(),legendVertical:z.boolean().optional(),precision:z.number().int().min(0).max(8).optional(),prefix:z.string().max(40).optional(),suffix:z.string().max(40).optional(),thousands:z.boolean().optional(),labelContent:z.enum(['value','name','percent','name-value']).optional(),tooltip:z.boolean().optional(),margin:z.number().min(0).max(200).optional(),bins:z.number().int().min(1).max(100).optional(),colorScale:z.enum(['continuous','piecewise']).optional(),colorLow:color.optional(),colorHigh:color.optional()}).strict();
export const chartAnnotationSchema = z.object({id,text:z.string().max(2000),kind:z.enum(['text','point','line','area']),rowId:id.optional(),seriesId:id.optional(),x:z.number().finite().default(50),y:z.number().finite().default(20),end:z.number().finite().optional(),color:color.default('#7c5ce7'),fontSize:z.number().min(8).max(80).default(16),width:z.number().min(40).max(1000).default(180),hidden:z.boolean().optional()}).strict();
export const chartStateSchema = z.object({id,name:z.string().max(200),kind:z.enum(chartKinds).optional(),appearance:chartAppearanceSchema.optional(),xAxis:chartAxisSchema.optional(),yAxis:chartAxisSchema.optional(),series:z.record(id,chartSeriesStyleSchema).optional(),emphasis:z.array(id).optional(),hiddenRows:z.array(id).optional(),annotations:z.array(id).optional(),rows:z.array(chartRowSchema).max(20000).optional()}).strict();
const chartShape = {
  version:z.literal(1),kind:z.enum(chartKinds),origin:z.enum(['manual','native']).default('manual'),
  columns:z.array(z.object({id,name:z.string().max(200),type:z.enum(['text','number','date'])}).strict()).min(2).max(100),
  rows:z.array(chartRowSchema).max(20000),
  series:z.array(z.object({id,name:z.string().max(200),columnId:id,type:z.enum(['bar','line']).optional(),axis:z.enum(['primary','secondary']).default('primary'),style:chartSeriesStyleSchema.default({}),points:z.record(id,chartSeriesStyleSchema).default({})}).strict()).min(1).max(100),
  bindings:z.object({label:id,x:id.optional(),y:id.optional(),size:id.optional(),value:id.optional(),seriesId:id.optional()}).strict(),
  edges:z.array(z.object({id,source:id,target:id,value:z.number().nonnegative()}).strict()).max(20000).default([]),
  appearance:chartAppearanceSchema.default({}),xAxis:chartAxisSchema.default({}),yAxis:chartAxisSchema.default({}),secondaryAxis:chartAxisSchema.default({}),
  annotations:z.array(chartAnnotationSchema).max(500).default([]),states:z.array(chartStateSchema).max(500).default([]),hiddenRows:z.array(id).default([]),
};
export const chartAuthoringSchema = z.object(chartShape).strict().superRefine((m,ctx)=>{
  const fail=(message:string)=>ctx.addIssue({code:'custom',message});
  for(const list of [m.columns,m.rows,m.series,m.edges,m.annotations,m.states])if(new Set(list.map(x=>x.id)).size!==list.length)fail('对象标识不能重复');
  const cols=new Map(m.columns.map(c=>[c.id,c])),rows=new Map(m.rows.map(r=>[r.id,r]));
  for(const c of [m.bindings.label,m.bindings.x,m.bindings.y,m.bindings.size,m.bindings.value,...m.series.map(s=>s.columnId)].filter(Boolean))if(!cols.has(c!))fail('数据列不存在');
  for(const row of m.rows){for(const [key,value] of Object.entries(row.values))if(!cols.has(key)||cols.get(key)?.type==='number'&&value!==null&&typeof value!=='number')fail(`数据行 ${row.id} 的数值无效`);let p=row.parentId;const seen=new Set([row.id]);while(p){if(!rows.has(p)||seen.has(p)){fail('父节点不存在或层级形成循环');break;}seen.add(p);p=rows.get(p)?.parentId;}}
  for(const e of m.edges)if(!rows.has(e.source)||!rows.has(e.target))fail('连线端点不存在');
  if(['pie','doughnut','rose','funnel','treemap','sunburst','gauge'].includes(m.kind)){const s=m.series.find(s=>s.id===m.bindings.seriesId)??m.series[0];if(m.rows.some(r=>typeof r.values[s.columnId]==='number'&&(r.values[s.columnId] as number)<0))fail('此图表需要非负数值');}
  if(m.kind==='sankey'){const visiting=new Set<string>(),done=new Set<string>();const visit=(key:string):boolean=>{if(visiting.has(key))return false;if(done.has(key))return true;visiting.add(key);for(const e of m.edges.filter(e=>e.source===key))if(!visit(e.target))return false;visiting.delete(key);done.add(key);return true;};if(m.rows.some(r=>!visit(r.id)))fail('桑基图连线不能形成循环');}
  if(JSON.stringify(m).length>4_000_000)fail('图表数据超过 4 MB，请减少数据');
});
export type ChartAuthoring = z.infer<typeof chartAuthoringSchema>;
export type ChartKind = ChartAuthoring['kind'];
export type ChartState = z.infer<typeof chartStateSchema>;
export type ChartSelection = {kind:'chart'|'series'|'point'|'title'|'legend'|'xAxis'|'yAxis'|'annotation';seriesId?:string;rowId?:string;annotationId?:string};
export const chartEditSchema = z.object({model:chartAuthoringSchema}).strict();
export function newChart(kind:ChartKind='column'):ChartAuthoring {
  const hierarchical=['tree','treemap','sunburst'].includes(kind),network=['graph','sankey'].includes(kind);
  const labels=hierarchical?['课程','概念','方法','应用']:network?['输入','模型 A','模型 B','输出']:['模型 A','模型 B','模型 C','模型 D'];
  return chartAuthoringSchema.parse({version:1,kind,columns:[{id:'label',name:'分类',type:'text'},{id:'training',name:'训练集',type:'number'},{id:'validation',name:'验证集',type:'number'}],rows:labels.map((label,i)=>({id:`row_${i}`,values:{label,training:[92,95,97,99][i],validation:[85,89,86,80][i]},...(hierarchical?{parentId:i?'row_0':null}:{})})),series:[{id:'series_training',name:'训练集',columnId:'training'},{id:'series_validation',name:'验证集',columnId:'validation',type:'line'}],bindings:{label:'label',x:'training',y:'validation',size:'training',value:'training'},edges:network?[{id:'edge_0',source:'row_0',target:'row_1',value:6},{id:'edge_1',source:'row_0',target:'row_2',value:4},{id:'edge_2',source:'row_1',target:'row_3',value:6},{id:'edge_3',source:'row_2',target:'row_3',value:4}]:[],appearance:{title:'模型表现',palette:['#7c5ce7','#39a7a0','#f2ad5e','#dc668e','#6c92d4'],fontSize:16,textColor:'#374151',legend:'auto'},xAxis:{},yAxis:{}});
}
export function chartAtState(base:ChartAuthoring, ids:string[]):ChartAuthoring{
  const m=structuredClone(base);
  for(const id of ids){const state=m.states.find(s=>s.id===id);if(!state)continue;
    if(state.kind)m.kind=state.kind;
    Object.assign(m.appearance,state.appearance);Object.assign(m.xAxis,state.xAxis);Object.assign(m.yAxis,state.yAxis);
    if(state.rows)m.rows=structuredClone(state.rows);
    if(state.hiddenRows)m.hiddenRows=[...state.hiddenRows];
    for(const s of m.series){Object.assign(s.style,state.series?.[s.id]);if(state.emphasis?.length&&!state.emphasis.includes(s.id))s.style.opacity=.2;}
    if(state.annotations)for(const a of m.annotations)a.hidden=!state.annotations.includes(a.id);
  }return m;
}
export function cleanChartReferences(m:ChartAuthoring):ChartAuthoring{
  const rows=new Set(m.rows.map(r=>r.id)),series=new Set(m.series.map(s=>s.id));
  m.edges=m.edges.filter(e=>rows.has(e.source)&&rows.has(e.target));
  m.hiddenRows=m.hiddenRows.filter(id=>rows.has(id));
  m.annotations=m.annotations.filter(a=>(!a.rowId||rows.has(a.rowId))&&(!a.seriesId||series.has(a.seriesId)));
  const annotations=new Set(m.annotations.map(a=>a.id));
  for(const s of m.series)for(const id of Object.keys(s.points))if(!rows.has(id))delete s.points[id];
  for(const state of m.states){if(state.series)state.series=Object.fromEntries(Object.entries(state.series).filter(([id])=>series.has(id)));if(state.annotations)state.annotations=state.annotations.filter(id=>annotations.has(id));if(state.emphasis)state.emphasis=state.emphasis.filter(id=>series.has(id));if(state.hiddenRows)state.hiddenRows=state.hiddenRows.filter(id=>rows.has(id));}
  return m;
}
export function cloneChart(m:ChartAuthoring, fresh:()=>string):{model:ChartAuthoring;ids:Map<string,string>}{
  const ids=new Map<string,string>();for(const list of [m.columns,m.rows,m.series,m.edges,m.annotations,m.states])for(const x of list)ids.set(x.id,fresh());
  const remap=(value:any):any=>Array.isArray(value)?value.map(remap):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[ids.get(k)??k,remap(v)])):typeof value==='string'?ids.get(value)??value:value;
  // Values and user-facing strings are content, never identity references.
  const out=remap(m) as ChartAuthoring;out.appearance=structuredClone(m.appearance);
  out.columns.forEach((c,i)=>c.name=m.columns[i].name);out.series.forEach((s,i)=>s.name=m.series[i].name);
  out.rows.forEach((r,i)=>r.values=Object.fromEntries(Object.entries(m.rows[i].values).map(([k,v])=>[ids.get(k)??k,v])));
  out.annotations.forEach((a,i)=>a.text=m.annotations[i].text);out.states.forEach((s,i)=>s.name=m.states[i].name);
  return {model:out,ids};
}
const quantile=(a:number[],p:number)=>{const x=(a.length-1)*p,i=Math.floor(x);return a[i]+(a[Math.min(i+1,a.length-1)]-a[i])*(x-i);};
export function compileChart(model:ChartAuthoring, stateIds:string[]=[], animated=false):Record<string,any>{
  const m=chartAtState(model,stateIds),a=m.appearance,rows=m.rows.filter(r=>!m.hiddenRows.includes(r.id));
  const label=(r:ChartAuthoring['rows'][number])=>String(r.values[m.bindings.label]??'');
  const numeric=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
  const palette=a.palette??['#7c5ce7','#39a7a0','#f2ad5e','#dc668e','#6c92d4'];
  const format=(v:unknown)=>typeof v==='number'?`${a.prefix??''}${new Intl.NumberFormat('zh-CN',{minimumFractionDigits:a.precision??0,maximumFractionDigits:a.precision??0,useGrouping:a.thousands??false}).format(v)}${a.suffix??''}`:String(v??'');
  const series=m.series.filter(s=>!s.style.hidden),single=series.find(s=>s.id===m.bindings.seriesId)??series[0]??m.series[0];
  const datum=(r:typeof rows[number],s:typeof single,value:any=numeric(r.values[s.columnId]))=>({id:r.id,name:label(r),value,itemStyle:{...s.points[r.id],...(s.points[r.id]?.color?{color:s.points[r.id].color}:{})},label:s.points[r.id]?.labels!==undefined?{show:s.points[r.id].labels}:undefined});
  const style=(s:typeof single,i:number)=>{const st=s.style,c=st.color??palette[i%palette.length];return {id:s.id,name:s.name,itemStyle:{color:st.gradient?{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:c},{offset:1,color:st.gradient}]}:c,opacity:st.opacity??1},lineStyle:{color:c,width:st.width??3,type:st.lineType??'solid',opacity:st.opacity??1},symbol:st.symbol??'circle',symbolSize:st.symbolSize??7,showSymbol:st.symbol!=='none',smooth:st.smooth??false,label:{show:st.labels??false,position:st.labelPosition??'top',color:a.textColor??'#374151',fontSize:a.fontSize??16,formatter:(p:any)=>a.labelContent==='name'?p.name:a.labelContent==='percent'?`${p.percent??p.value}%`:a.labelContent==='name-value'?`${p.name}\n${format(p.value)}`:format(p.value)},emphasis:{focus:'series'}};};
  const axis=(spec:ChartAuthoring['xAxis'],type:string)=>({type:spec.type??type,name:spec.name??'',min:spec.min??undefined,max:spec.max??undefined,interval:spec.interval??undefined,inverse:spec.inverse??false,triggerEvent:true,axisLabel:{show:spec.labels!==false,rotate:spec.rotate??0,formatter:type==='value'?format:undefined},splitLine:{show:spec.grid??type==='value',lineStyle:{color:'#e5e7eb'}}});
  const legend=a.legend??'auto';
  const option:Record<string,any>={animation:animated,animationDurationUpdate:animated?400:0,backgroundColor:a.background??'transparent',color:palette,textStyle:{fontFamily:a.fontFamily??'system-ui, sans-serif',fontSize:a.fontSize??16,color:a.textColor??'#374151'},title:{text:a.title??'',subtext:a.subtitle??'',left:'center',top:12,triggerEvent:true,textStyle:{fontFamily:a.fontFamily,fontSize:(a.fontSize??16)+6,color:a.textColor}},tooltip:{show:a.tooltip!==false,trigger:'item',confine:true},legend:{show:legend!=='none'&&(legend!=='auto'||series.length>1),orient:a.legendVertical||['left','right'].includes(legend)?'vertical':'horizontal',...(legend==='left'?{left:8,top:'middle'}:legend==='right'?{right:8,top:'middle'}:legend==='top'?{top:52}:{bottom:8}),selectedMode:true},grid:{left:a.margin??60,right:a.margin??50,top:a.title?90:35,bottom:60,containLabel:true},series:[]};
  const cartesian=['column','bar','stacked','percent','line','area','stacked-area','combo','waterfall','scatter','bubble','histogram','boxplot','heatmap'].includes(m.kind);
  if(cartesian){option.xAxis=axis(m.xAxis,['scatter','bubble'].includes(m.kind)?'value':'category');option.yAxis=axis(m.yAxis,'value');if(!['scatter','bubble'].includes(m.kind))option.xAxis.data=rows.map(label);}
  if(['column','bar','stacked','percent','line','area','stacked-area','combo'].includes(m.kind)){
    option.series=series.map((s,i)=>{const type=m.kind==='combo'?(s.type??(i?'line':'bar')):['line','area','stacked-area'].includes(m.kind)?'line':'bar';return {...style(s,i),type,yAxisIndex:m.kind==='bar'?undefined:s.axis==='secondary'?1:0,xAxisIndex:m.kind==='bar'&&s.axis==='secondary'?1:0,stack:['stacked','percent','stacked-area'].includes(m.kind)?'total':undefined,areaStyle:['area','stacked-area'].includes(m.kind)?{opacity:.22}:undefined,data:rows.map(r=>{let v=numeric(r.values[s.columnId]);if(m.kind==='percent'){const total=series.reduce((sum,t)=>sum+(numeric(r.values[t.columnId])??0),0);v=total&&v!==null?v/total*100:0;}return datum(r,s,v);})};});
    if(series.some(s=>s.axis==='secondary'))option.yAxis=[option.yAxis,axis(m.secondaryAxis,'value')];
    if(m.kind==='percent'){option.yAxis.max=100;option.yAxis.axisLabel.formatter='{value}%';}
    if(m.kind==='bar')[option.xAxis,option.yAxis]=[option.yAxis,option.xAxis];
  }else if(['pie','doughnut','rose','funnel','gauge'].includes(m.kind)){
    option.legend.show=legend!=='none'&&m.kind!=='gauge';
    option.series=[{...style(single,0),type:m.kind==='funnel'?'funnel':m.kind==='gauge'?'gauge':'pie',radius:m.kind==='doughnut'?['40%','65%']:'65%',center:['50%','55%'],roseType:m.kind==='rose'?'radius':undefined,top:80,bottom:40,detail:m.kind==='gauge'?{formatter:format,fontSize:26}:undefined,data:(m.kind==='gauge'?rows.slice(0,1):rows).map(r=>datum(r,single))}];
  }else if(['scatter','bubble'].includes(m.kind)){
    option.series=[{...style(single,0),type:'scatter',symbolSize:m.kind==='bubble'?(v:any)=>Math.max(6,Math.min(70,Math.sqrt(Math.max(0,v[2]??0))*3)):single.style.symbolSize??12,data:rows.map(r=>datum(r,single,[numeric(r.values[m.bindings.x??single.columnId]),numeric(r.values[m.bindings.y??m.series[1]?.columnId??single.columnId]),numeric(r.values[m.bindings.size??single.columnId])]))}];
  }else if(m.kind==='histogram'){
    const values=series.flatMap(s=>rows.map(r=>numeric(r.values[s.columnId])).filter((v):v is number=>v!==null));const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1,bins=a.bins??Math.max(1,Math.ceil(Math.log2(Math.max(1,values.length))+1)),width=(max-min||1)/bins;
    option.xAxis.data=Array.from({length:bins},(_,i)=>`${(min+i*width).toFixed(1)}–${(min+(i+1)*width).toFixed(1)}`);
    option.series=series.map((s,i)=>{const counts=Array(bins).fill(0);for(const r of rows){const v=numeric(r.values[s.columnId]);if(v!==null)counts[Math.min(bins-1,Math.max(0,Math.floor((v-min)/width)))]++;}return {...style(s,i),type:'bar',barGap:0,data:counts};});
  }else if(m.kind==='boxplot'){
    option.legend.show=false;option.xAxis.data=series.map(s=>s.name);option.series=[{id:'boxplot',type:'boxplot',data:series.map(s=>{const v=rows.map(r=>numeric(r.values[s.columnId])).filter((v):v is number=>v!==null).sort((a,b)=>a-b);if(!v.length)return {id:s.id,value:[]};const q1=quantile(v,.25),q3=quantile(v,.75),iqr=q3-q1;return {id:s.id,name:s.name,value:[v.find(x=>x>=q1-1.5*iqr)!,q1,quantile(v,.5),q3,[...v].reverse().find(x=>x<=q3+1.5*iqr)!]};})}];
  }else if(m.kind==='radar'){
    option.radar={indicator:rows.map(r=>({name:label(r),max:Math.max(1,...series.map(s=>numeric(r.values[s.columnId])??0))*1.1})),radius:'60%',center:['50%','56%']};option.series=[{id:'radar',type:'radar',data:series.map((s,i)=>({...style(s,i),value:rows.map(r=>numeric(r.values[s.columnId]))}))}];
  }else if(m.kind==='heatmap'){
    option.yAxis={...axis({},'category'),data:series.map(s=>s.name)};const data=series.flatMap((s,i)=>rows.map((r,j)=>({...datum(r,s,[j,i,numeric(r.values[s.columnId])]),id:`${s.id}_${r.id}`})));const values=data.map(d=>d.value[2]??0);option.visualMap={type:a.colorScale??'continuous',min:Math.min(0,...values),max:Math.max(1,...values),orient:'horizontal',left:'center',bottom:0,inRange:{color:[a.colorLow??'#e8e1fc',a.colorHigh??'#7350d2']}};option.legend.show=false;option.grid.bottom=90;option.series=[{id:single.id,type:'heatmap',data,label:{show:single.style.labels??true}}];
  }else if(['tree','treemap','sunburst'].includes(m.kind)){
    const build=(parent:string|null):any[]=>rows.filter(r=>(r.parentId??null)===parent).map(r=>({...datum(r,single),children:build(r.id)}));const roots=build(null);option.legend.show=false;option.series=[{...style(single,0),type:m.kind,data:m.kind==='tree'&&roots.length>1?[{name:a.title??'',children:roots}]:roots,top:80,bottom:40,roam:true,expandAndCollapse:true,label:{show:true,position:'right'},leaves:{label:{position:'right'}}}];
  }else if(['graph','sankey'].includes(m.kind)){
    option.legend.show=false;option.series=[{...style(single,0),type:m.kind,layout:'force',force:{repulsion:180,edgeLength:100},roam:true,draggable:true,top:80,bottom:40,data:rows.map(r=>({...datum(r,single),name:m.kind==='sankey'?r.id:label(r),symbolSize:30,label:{show:true,formatter:()=>label(r)}})),links:m.edges.filter(e=>rows.some(r=>r.id===e.source)&&rows.some(r=>r.id===e.target)).map(e=>({...e})),label:{show:true},lineStyle:{color:'source',curveness:.25}}];
  }else if(m.kind==='waterfall'){
    let total=0;const floor:number[]=[],up:any[]=[],down:any[]=[];for(const r of rows){const v=numeric(r.values[single.columnId])??0;floor.push(Math.min(total,total+v));up.push(v>=0?datum(r,single,v):'-');down.push(v<0?datum(r,single,-v):'-');total+=v;}option.series=[{id:'waterfall_offset',type:'bar',stack:'waterfall',silent:true,itemStyle:{color:'transparent'},emphasis:{itemStyle:{color:'transparent'}},data:floor},{...style(single,0),type:'bar',stack:'waterfall',data:up},{...style(single,1),id:`${single.id}_negative`,type:'bar',stack:'waterfall',itemStyle:{color:'#dc668e'},data:down}];
  }
  const annotations=m.annotations.filter(a=>!a.hidden);
  option.graphic=annotations.filter(a=>a.kind==='text').map(a=>({id:a.id,type:'text',left:`${a.x}%`,top:`${a.y}%`,z:100,style:{text:a.text,fill:a.color,font:`${a.fontSize}px ${m.appearance.fontFamily??'sans-serif'}`,width:a.width,overflow:'break'}}));
  for(const s of option.series){const marks=annotations.filter(a=>!a.seriesId||a.seriesId===s.id);if(cartesian){s.markLine={silent:true,symbol:'none',data:marks.filter(a=>a.kind==='line').map(a=>({name:a.text,yAxis:a.y,lineStyle:{color:a.color},label:{formatter:a.text}}))};s.markArea={silent:true,data:marks.filter(a=>a.kind==='area').map(a=>[{name:a.text,xAxis:a.x,itemStyle:{color:a.color,opacity:.15}},{xAxis:a.end??a.x+1}])};s.markPoint={data:marks.filter(a=>a.kind==='point'&&rows.some(r=>r.id===a.rowId)).map(a=>{const index=rows.findIndex(r=>r.id===a.rowId),r=rows[index],source=series.find(t=>t.id===s.id)??single;return {name:a.text,coord:[index,r.values[source.columnId]],symbol:'pin',symbolSize:38,itemStyle:{color:a.color},label:{formatter:a.text,fontSize:a.fontSize}};})};}}
  return option;
}
