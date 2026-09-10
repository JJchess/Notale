import { diagramPreview } from './diagram-previews.js';
import { shapes, shapeIcon } from './templates.js';
import { icons, iconPreview } from './icon-library.js';
const SYMBOLS = 'α β γ δ ε θ λ μ π σ φ ω Δ Σ Ω ∑ ∏ ∫ ∂ ∇ √ ∞ ≈ ≠ ≤ ≥ ± × ÷ ∈ ∉ ∀ ∃ ⊂ ∪ ∩ → ← ↔ ⇒ ⇐ ⇔ ↑ ↓ ↦'.split(' ');
type Item = {kind:string;label:string;preview:string;title?:string;symbol?:string};
type Group = {label?:string;className?:string;id?:string;items:Item[]};
type Category = {key:string;label:string;open?:boolean;groups:Group[];search?:boolean};
const item=(kind:string,label:string,preview:string,title?:string):Item=>({kind,label,preview,title});
const glyph=(value:string)=>`<span aria-hidden="true">${value}</span>`;
const wordart:Item[]=[
  ['gradient','渐变','background:linear-gradient(90deg,#466ddb,#28a69b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent'],
  ['outline','描边','color:#fff;-webkit-text-stroke:1.5px #263449'],
  ['shadow','阴影','color:#466ddb;text-shadow:2px 2px 0 #dee8ff,4px 4px 0 #bcc9db'],
].map(([kind,label,style])=>item(`wordart:${kind}`,label,`<span aria-hidden="true" style="${style};font-weight:800">Aa</span>`,`${label}艺术字`));
const shapeItems=(names:string[])=>shapes.filter(s=>names.includes(s.name)).map(s=>item(`shape:${s.name}`,s.label,shapeIcon(s.name)));
// One catalog owns the insertion hierarchy. Commands and object formats remain stable.
export const insertCategories:Category[]=[
  {key:'text',label:'文字',open:true,groups:[
    {className:'text-box-grid',items:[item('text','横排文本框',''),item('vertical-text','竖排文本框','')]},
    {label:'艺术字',className:'wordart-grid',items:wordart},
    {className:'wordart-grid text-extra-grid',items:[item('code','代码块',glyph('&lt;/&gt;')),item('date','日期',iconPreview('calendar'))]},
  ]},
  {key:'shapes',label:'形状',open:true,groups:[
    {label:'基本形状',id:'shape-gallery',className:'shape-grid',items:shapeItems(['rect','rounded','ellipse','triangle','diamond','parallelogram','pentagon','hexagon','star'])},
    {label:'线条与连接线',className:'shape-grid',items:[item('line','箭头线',glyph('↗'),'插入独立箭头线'),item('connector','连接线',iconPreview('git-branch'),'连接对象，端点随对象移动；可在属性中设置箭头')]},
    {label:'箭头形状',className:'shape-grid',items:shapeItems(['arrow-right','arrow-double'])},
    {label:'标注框',className:'shape-grid',items:shapeItems(['callout'])},
  ]},
  {key:'media',label:'媒体',groups:[{className:'wordart-grid',items:[item('image','图片',iconPreview('image'),'上传图片或 SVG'),item('video','视频',glyph('▷')),item('audio','音频',glyph('♫'))]}]},
  {key:'icons',label:'图标',search:true,groups:[
    {id:'icon-gallery',className:'icon-grid',items:icons.map(i=>{const label=i.label+'图标';return item(`icon:${i.name}`,label,iconPreview(i.name),`插入${label}`);})},
  ]},
  {key:'data',label:'图表与表格',groups:[{className:'wordart-grid',items:[item('chart','图表',iconPreview('bar-chart')),item('table','表格',iconPreview('table'))]}]},
  {key:'diagrams',label:'图示',groups:[{className:'diagram-grid',items:[item('smart:process','流程',diagramPreview('process'),'三步递进流程'),item('smart:list','列表',diagramPreview('list'),'带编号的要点列表'),item('smart:cycle','循环',diagramPreview('cycle'),'三个阶段的循环关系')]}]},
  {key:'math',label:'公式与符号',groups:[
    {className:'wordart-grid',items:[item('equation','数学公式',glyph('∑'))]},
    {label:'数学符号与希腊字母',className:'symbol-grid',items:SYMBOLS.map(c=>({...item('symbol',c,'',`插入符号 ${c}`),symbol:c}))},
  ]},
  {key:'interactive',label:'互动',groups:[]},
];
const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function buildInsertPanel(host:HTMLElement){
  host.innerHTML=insertCategories.map(category=>`<details class="insert-category" data-insert-category="${category.key}"${category.open?' open':''}><summary>${category.label}</summary><section data-library="${category.key}">${category.groups.map(group=>`${group.label?`<h3 class="insert-group-title">${group.label}</h3>`:''}${category.search&&group.id==='icon-gallery'?'<input id="icon-search" type="search" placeholder="搜索图标" aria-label="搜索图标" autocomplete="off">':''}<div${group.id?` id="${group.id}"`:''} class="resource-grid ${group.className??''}">${group.items.map(i=>`<button type="button" data-insert="${i.kind}"${i.symbol?` data-symbol="${escape(i.symbol)}"`:''} title="${escape(i.title??`插入${i.label}`)}">${i.preview}<span class="insert-item-label">${escape(i.label)}</span></button>`).join('')}</div>`).join('')}</section></details>`).join('');
  const search=host.querySelector<HTMLInputElement>('#icon-search')!;
  search.oninput=()=>{const q=search.value.trim().toLocaleLowerCase();for(const b of host.querySelectorAll<HTMLButtonElement>('#icon-gallery button'))b.hidden=!!q&&!(b.title+b.dataset.insert).toLocaleLowerCase().includes(q);};
}
