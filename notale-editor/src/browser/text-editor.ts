import {Schema,DOMParser as PMParser,DOMSerializer,type NodeSpec,type MarkSpec} from 'prosemirror-model';
import {EditorState,TextSelection,type Transaction} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {keymap} from 'prosemirror-keymap';
import {baseKeymap} from 'prosemirror-commands';
const inlineTags=['span','b','strong','i','em','u','s','sub','sup','a'];
const rootTags=new Set(['P','H1','H2','H3','H4','H5','H6','SPAN','A','LABEL','BUTTON','LI','BLOCKQUOTE','TD','TH','DIV','SECTION','ARTICLE']);
const attrs=(el:HTMLElement)=>Object.fromEntries([...el.attributes].filter(a=>!a.name.startsWith('on')&&!['contenteditable','spellcheck'].includes(a.name)).map(a=>[a.name,a.value]));
export function canEditText(el:HTMLElement){return el.namespaceURI==='http://www.w3.org/1999/xhtml'&&rootTags.has(el.tagName)&&![...el.querySelectorAll('*')].some(n=>![...inlineTags,'br','p','ul','ol','li'].includes(n.localName));}
function textSchema(block:boolean){
 const nodes:Record<string,NodeSpec>={doc:{content:block?'block+':'inline*'},text:{group:'inline'},hard_break:{inline:true,group:'inline',selectable:false,attrs:{html:{default:{}}},parseDOM:[{tag:'br',getAttrs:n=>({html:attrs(n as HTMLElement)})}],toDOM:n=>['br',n.attrs.html]},inline_wrapper:{inline:true,group:'inline',content:'inline*',attrs:{tag:{default:'span'},html:{default:{}}},parseDOM:inlineTags.map(tag=>({tag,getAttrs:n=>({tag,html:attrs(n as HTMLElement)})})),toDOM:n=>[n.attrs.tag,n.attrs.html,0]}};
 if(block){nodes.paragraph={group:'block',content:'inline*',attrs:{html:{default:{}}},parseDOM:[{tag:'p',getAttrs:n=>({html:attrs(n as HTMLElement)})}],toDOM:n=>['p',n.attrs.html,0]};for(const tag of ['ul','ol'])nodes[tag]={group:'block',content:'li+',attrs:{html:{default:{}}},parseDOM:[{tag,getAttrs:n=>({html:attrs(n as HTMLElement)})}],toDOM:n=>[tag,n.attrs.html,0]};nodes.li={content:'paragraph block*',attrs:{html:{default:{}}},parseDOM:[{tag:'li',getAttrs:n=>({html:attrs(n as HTMLElement)})}],toDOM:n=>['li',n.attrs.html,0]};}
 const marks:Record<string,MarkSpec>={};
 for(const property of ['font-weight','font-style','text-decoration','color','font-family','font-size','background-color'])marks[property]={attrs:{value:{}},toDOM:m=>['span',{style:`${property}:${m.attrs.value}`},0]};
 marks.link={attrs:{href:{}},inclusive:false,toDOM:m=>['a',{href:m.attrs.href},0]};
 return new Schema({nodes,marks});
}
export type TextContext={sessionId:string;selectionToken:number;target:string;selectedText:string;selectedHtml:string;collapsed:boolean;styles:Record<string,string>;mixed:string[]};
export type TextEditorOptions={change:(data:{sessionId:string;target:string;sequence:number;html:string;beforeHtml?:string;immediate:boolean;composing:boolean;style?:Record<string,string>})=>void;context:(data:TextContext)=>void;history:(action:'undo'|'redo')=>void;end:()=>void;error:(message:string)=>void;protectedIds?:Set<string>};
export function createTextEditor(root:HTMLElement,options:TextEditorOptions){
 const block=['DIV','SECTION','ARTICLE','BLOCKQUOTE','LI','TD','TH'].includes(root.tagName)&&!!root.querySelector('p,ul,ol');
 const schema=textSchema(block),original=attrs(root),sessionId=crypto.randomUUID();
 let sequence=0,selectionToken=0,bookmark:ReturnType<EditorState['selection']['getBookmark']>|undefined,disposed=false,formatting=false,lastHtml=root.innerHTML;
 const parser=PMParser.fromSchema(schema);
 const parse=(html:string)=>{const holder=document.createElement('div');holder.innerHTML=html;return parser.parse(holder,{preserveWhitespace:"full"});};
 function html(doc=view.state.doc){const holder=document.createElement('div');holder.append(DOMSerializer.fromSchema(schema).serializeFragment(doc.content));const seen=new Set<string>();for(const el of holder.querySelectorAll('[data-notale-id]')){const id=el.getAttribute('data-notale-id')!;if(seen.has(id)){if(options.protectedIds?.has(id))throw Error('不能拆分有互动引用的文字节点');el.removeAttribute('data-notale-id');}seen.add(id);}return holder.innerHTML;}
 function emit(immediate=false){if(disposed)return;const next=html();if(next===lastHtml)return;const beforeHtml=lastHtml;lastHtml=next;options.change({sessionId,target:root.dataset.notaleId!,sequence:++sequence,html:next,beforeHtml,immediate,composing:view.composing});}
 function dispatch(tr:Transaction){
  if(tr.docChanged){try{html(tr.doc);}catch(e){options.error(String(e));return;}}
  if(tr.docChanged&&options.protectedIds?.size){const before=new Set<string>(),after=new Set<string>();view.state.doc.descendants(n=>{if(n.attrs.html?.['data-notale-id'])before.add(n.attrs.html['data-notale-id']);});tr.doc.descendants(n=>{if(n.attrs.html?.['data-notale-id'])after.add(n.attrs.html['data-notale-id']);});if([...before].some(id=>options.protectedIds!.has(id)&&!after.has(id))){options.error('这段文字关联了互动或动画，请保留对应节点');return;}}
  if(bookmark)bookmark=bookmark.map(tr.mapping);
  view.updateState(view.state.apply(tr));
  if(tr.docChanged){try{emit(formatting);}catch(e){options.error(String(e));}}
 }
 const initial=parse(root.innerHTML);if(initial.textContent!==root.textContent?.replace(/\r\n?/g,'\n'))throw Error('该文本结构暂时无法安全编辑');
 const view=new EditorView({mount:root},{state:EditorState.create({schema,doc:initial,plugins:[keymap({...baseKeymap,Enter:(state,dispatch)=>{if(block)return baseKeymap.Enter(state,dispatch);dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());return true;},'Mod-z':()=>{options.history('undo');return true;},'Mod-Shift-z':()=>{options.history('redo');return true;},'Mod-y':()=>{options.history('redo');return true;}})]}),dispatchTransaction:dispatch,handleDOMEvents:{compositionend:()=>{queueMicrotask(()=>{emit();options.change({sessionId,target:root.dataset.notaleId!,sequence,html:lastHtml,immediate:false,composing:false});});return false;},keydown:(_v,e)=>{if(e.key==='Escape'){e.preventDefault();options.end();return true;}if((e.ctrlKey||e.metaKey)&&['b','i','u'].includes(e.key.toLowerCase())){e.preventDefault();freeze();format(e.key.toLowerCase()==='b'?'font-weight':e.key.toLowerCase()==='i'?'font-style':'text-decoration','toggle',selectionToken);return true;}return false;},click:(_v,e)=>{if((e.target as Element)?.closest('a'))e.preventDefault();return false;}},handlePaste:(_v,e)=>{const text=e.clipboardData?.getData('text/plain');if(text===undefined)return false;e.preventDefault();view.dispatch(view.state.tr.insertText(text));return true;},handleDrop:()=>true});
 function freeze():TextContext{
  bookmark=view.state.selection.getBookmark();selectionToken++;
  const sel=view.state.selection,domSelection=document.getSelection(),range=domSelection?.rangeCount?domSelection.getRangeAt(0):undefined;
  const nodes:HTMLElement[]=[];if(range&&root.contains(range.commonAncestorContainer)){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null;while(node=walker.nextNode())if(range.intersectsNode(node)&&node.parentElement)nodes.push(node.parentElement);}
  if(!nodes.length)nodes.push((domSelection?.anchorNode?.nodeType===1?domSelection.anchorNode:domSelection?.anchorNode?.parentElement) as HTMLElement??root);
  const styles:Record<string,string>={},mixed:string[]=[];
  for(const property of ['font-family','font-size','font-weight','font-style','text-decoration','color','text-align']){const values=nodes.map(n=>getComputedStyle(n).getPropertyValue(property));styles[property]=values[0]??'';if(values.some(v=>v!==values[0]))mixed.push(property);}
  const holder=document.createElement('div');if(!sel.empty)holder.append(DOMSerializer.fromSchema(schema).serializeFragment(sel.content().content));
  const result={sessionId,selectionToken,target:root.dataset.notaleId!,selectedText:sel.content().content.textBetween(0,sel.content().content.size,'\n'),selectedHtml:holder.innerHTML,collapsed:sel.empty,styles,mixed};options.context(result);return result;
 }
 function restore(token:number){if(disposed||token!==selectionToken||!bookmark)throw Error('文字选区已变化，请重新右键选择');const selection=bookmark.resolve(view.state.doc);view.dispatch(view.state.tr.setSelection(selection));}
 function format(property:string,value:string,token:number){restore(token);const {from,to,empty}=view.state.selection;let tr=view.state.tr;
  if(value==='toggle'){const el=view.domAtPos(from).node;const css=getComputedStyle(el instanceof HTMLElement?el:el.parentElement??root);value=property==='font-weight'?Number(css.fontWeight)>=600?'400':'700':property==='font-style'?css.fontStyle==='italic'?'normal':'italic':css.textDecorationLine.includes('underline')?'none':'underline';}
  if(property==='text-align'){
    if(block)view.state.doc.nodesBetween(from,to,(n,pos)=>{if(n.type===schema.nodes.paragraph){const holder=document.createElement('p');Object.entries(n.attrs.html).forEach(([k,v])=>holder.setAttribute(k,String(v)));holder.style.textAlign=value;tr=tr.setNodeMarkup(pos,undefined,{html:attrs(holder)});}});
    else {root.style.textAlign=value;options.change({sessionId,target:root.dataset.notaleId!,sequence:++sequence,html:html(),immediate:true,composing:false,...{style:{'text-align':value}}});return;}
  }else if(property==='link'){if(value&&!/^https?:|^mailto:/i.test(value))throw Error('请输入有效的 https、http 或邮件链接');view.state.doc.nodesBetween(from,to,(n,pos)=>{if(n.type===schema.nodes.inline_wrapper&&n.attrs.tag==='a'){if(from>pos+1||to<pos+n.nodeSize-1)throw Error('请选中完整链接后修改链接地址');const attributes={...n.attrs.html};delete attributes.href;tr=tr.setNodeMarkup(pos,undefined,{tag:'span',html:attributes});}});tr=tr.removeMark(from,to,schema.marks.link);if(value)tr=tr.addMark(from,to,schema.marks.link.create({href:value}));
  }else if(property==='clear'){const css=getComputedStyle(root);for(const [key,type] of Object.entries(schema.marks)){if(key==='link')continue;const value=key==='font-weight'?'400':key==='font-style'?'normal':key==='text-decoration'?'none':key==='background-color'?'transparent':css.getPropertyValue(key);tr=empty?tr.addStoredMark(type.create({value})):tr.addMark(from,to,type.create({value}));}}
  else {const type=schema.marks[property];if(!type)throw Error('不支持的文字格式');const mark=type.create({value});tr=empty?tr.addStoredMark(mark):tr.addMark(from,to,mark);}
  formatting=true;view.dispatch(tr);formatting=false;bookmark=view.state.selection.getBookmark();freeze();
 }
 view.focus();
 return {root,sessionId,freeze,format,get sequence(){return sequence;},get composing(){return view.composing;},flush:()=>emit(true),selectAll(){view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,0,view.state.doc.content.size)));return freeze();},replace(text:string,token:number){restore(token);formatting=true;view.dispatch(view.state.tr.insertText(text));formatting=false;},ack(sequenceAtAck:number,content:string){if(sequenceAtAck<sequence||view.composing)return;const next=parse(content);if(!next.eq(view.state.doc)){const old=view.state.selection,offsets=[old.anchor,old.head].map(pos=>view.state.doc.textBetween(0,pos,'\n','\n').length);const tr=view.state.tr.replaceWith(0,view.state.doc.content.size,next.content);const position=(offset:number)=>{let found=tr.doc.content.size;tr.doc.descendants((n,pos)=>{if(n.isText&&found===tr.doc.content.size){const start=tr.doc.textBetween(0,pos,'\n','\n').length;if(offset<=start+n.nodeSize)found=pos+Math.max(0,offset-start);}});return found;};view.updateState(view.state.apply(tr.setSelection(TextSelection.create(tr.doc,position(offsets[0]),position(offsets[1])))));}lastHtml=content;bookmark=view.state.selection.getBookmark();},destroy(){if(disposed)return;const content=html();original.style=root.getAttribute('style')??'';disposed=true;view.destroy();for(const a of [...root.attributes])root.removeAttribute(a.name);for(const [name,value]of Object.entries(original))root.setAttribute(name,value);root.innerHTML=content;}};
}
