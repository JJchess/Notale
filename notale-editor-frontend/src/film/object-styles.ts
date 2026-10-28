import {attachColorPicker} from './color-picker.js';
export function objectStyles(options:{locked:boolean;read:(name:string)=>string;write:(name:string,value:string)=>void}){
 const root=document.createElement('div');root.className='film-object-styles';const refreshers:(()=>void)[]=[];
 const field=(name:string,title:string,kind:'text'|'number'|'color',unit='')=>{const label=document.createElement('label'),input=document.createElement('input');input.type=kind;input.setAttribute('aria-label',title);input.disabled=options.locked;if(kind==='number')input.step='any';label.append(title,input);root.append(label);
  input.onchange=()=>{if(input.value)options.write(name,input.value+unit);};const picker=kind==='color'?attachColorPicker(input,title):undefined;
  refreshers.push(()=>{if(document.activeElement===input)return;const value=options.read(name);if(kind==='number')input.value=Number.isFinite(parseFloat(value))?String(parseFloat(value)):'';else input.value=value;picker?.refresh();});return input;
 };
 field('font-family','对象字体','text');field('font-size','对象字号','number','px');field('color','文字颜色','color');field('background-color','填充颜色','color');
 field('line-height','对象行高','number','px');field('letter-spacing','对象字距','number','px');field('border-radius','对象圆角','number','px');field('opacity','对象透明度','number');
 const border=field('border-width','对象边框宽度','number','px');border.onchange=()=>{options.write('border-width',border.value+'px');options.write('border-style','solid');};field('border-color','对象边框颜色','color');
 const tools=document.createElement('div');tools.className='film-actions';root.prepend(tools);
 for(const [name,title,text,on,off] of [['font-weight','加粗','B','700','400'],['font-style','斜体','I','italic','normal'],['text-decoration-line','下划线','U','underline','none'],['text-align','左对齐','≡','left','left'],['text-align','居中对齐','≡','center','center'],['text-align','右对齐','≡','right','right']]){const b=document.createElement('button');b.textContent=text;b.title=title;b.setAttribute('aria-label','对象'+title);b.disabled=options.locked;if(name==='text-align')b.style.textAlign=on;b.onclick=()=>options.write(name,options.read(name)===on?off:on);tools.append(b);refreshers.push(()=>b.setAttribute('aria-pressed',String(options.read(name)===on)));}
 return {node:root,refresh:()=>refreshers.forEach(f=>f())};
}
