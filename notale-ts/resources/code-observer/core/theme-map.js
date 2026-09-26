import { readDeckTheme, defaultTheme } from "./deck-source.js";
// Browser resolves CSS color syntax; Monaco receives sRGB hex, not raw CSS functions.
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
const ctx = canvas.getContext('2d', {willReadFrequently:true});
function rgb(value) {
  ctx.clearRect(0,0,1,1); ctx.fillStyle=value; ctx.fillRect(0,0,1,1);
  return [...ctx.getImageData(0,0,1,1).data].slice(0,3);
}
function hex(value) { return '#'+value.map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''); }
function mix(a,b,t) {return hex(rgb(a).map((v,i)=>v*(1-t)+rgb(b)[i]*t));}
function luminance(color) {
  return rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function mapTheme(input) {
const opaque=(color,under)=>{ctx.fillStyle=under;ctx.fillRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return hex([...ctx.getImageData(0,0,1,1).data].slice(0,3));};
const bg=opaque(input.values.bg,"#ffffff");
const read = key => opaque(input.values[key],bg);
const dark=luminance(bg)<.179;
// Deterministic contrast adjustment, never a generation/rejection gate.
function readable(color,min=4.5){
  const end=dark?'#ffffff':'#000000';
  for(let i=0;i<=100;i++){const c=mix(color,end,i/100);if(contrast(c,bg)>=min)return c;}
  return end;
}
const ink=readable(read("ink"));
const muted=readable(read("muted")), accent=readable(read("accent"));
// Catppuccin Latte / Mocha palette & token-role mapping (MIT); see licenses/README.md.
const p=dark
  ? {keyword:'#cba6f7',string:'#a6e3a1',number:'#fab387',comment:'#9399b2',red:'#f38ba8',green:'#a6e3a1',yellow:'#f9e2af'}
  : {keyword:'#8839ef',string:'#40a02b',number:'#fe640b',comment:'#7c7f93',red:'#d20f39',green:'#40a02b',yellow:'#df8e1d'};
const syntax=Object.fromEntries(Object.entries(p).map(([k,v])=>[k,readable(v)]));
const line=mix(bg,ink,.23), secondary=syntax.number;
const values={bg,text:ink,workbench:bg,editor:bg,panel:mix(bg,ink,.025),surface:mix(bg,ink,.06),
  'surface-active':mix(bg,ink,.1),line,'line-strong':mix(bg,ink,.4),'text-bright':ink,muted,faint:muted,
  blue:accent,bar:accent,active:accent,changed:secondary,success:syntax.green,danger:syntax.red,
  warning:syntax.yellow,focus:accent,'execution-fill':mix(bg,accent,.1),'execution-line':mix(bg,accent,.3)};
for(const [key,value] of Object.entries(values)) document.documentElement.style.setProperty('--'+key,value);
document.documentElement.style.colorScheme=dark?'dark':'light';
const theme={
  view:{bg,ink,muted,accent,secondary,line},
  monaco:{base:dark?'vs-dark':'vs',inherit:true,
    rules:[...['keyword','string','number','comment'].map(token=>({token,foreground:syntax[token].slice(1)})),
      {token:'identifier',foreground:ink.slice(1)}, {token:'delimiter',foreground:ink.slice(1)},
      {token:'operator',foreground:ink.slice(1)}],
    colors:{'editor.background':bg,'editor.foreground':ink,'editorGutter.background':bg,
      'editorLineNumber.foreground':muted,'editorLineNumber.activeForeground':ink,
      'editorCursor.foreground':accent,'editor.selectionBackground':mix(bg,accent,.22),
      'editor.inactiveSelectionBackground':mix(bg,ink,.1),'editor.lineHighlightBackground':mix(bg,ink,.045),
      'editorIndentGuide.background1':line,'editorIndentGuide.activeBackground1':muted,
      'editorError.foreground':syntax.red,'editorWarning.foreground':syntax.yellow,
      'editorBracketHighlight.foreground1':muted,'editorBracketHighlight.foreground2':syntax.keyword,
      'editorBracketHighlight.foreground3':syntax.string,'editorBracketHighlight.foreground4':muted,
      'editorBracketHighlight.foreground5':syntax.keyword,'editorBracketHighlight.foreground6':syntax.string,
      'scrollbarSlider.background':mix(bg,ink,.2),'scrollbarSlider.hoverBackground':mix(bg,ink,.3),
      'scrollbarSlider.activeBackground':mix(bg,ink,.4)}},
};
// Read-only inspection surface for this standalone review, not a harness protocol.
window.codeThemeReview={...input,syntaxFamily:dark?'Catppuccin Mocha':'Catppuccin Latte',
  colors:theme.view,syntax,contrast:Object.fromEntries(Object.entries({ink,muted,accent,...syntax}).map(([k,v])=>[k,contrast(v,bg)]))};

return theme;
}
export let codeTheme;
let requestId=0;
window.changeCodeTheme=async (path,variant="")=>{
  const id=++requestId;
  const input=await readDeckTheme(path,variant);
  if(id!==requestId)return null;
  codeTheme=mapTheme(input);
  window.dispatchEvent(new Event("code-theme-change"));
  return window.codeThemeReview;
};
const query=new URLSearchParams(location.search);
await window.changeCodeTheme(query.get("theme")||defaultTheme,query.get("variant")||"");
