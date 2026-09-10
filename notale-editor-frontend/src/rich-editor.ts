import type {Command} from '@notale/editor/browser';
type ObjectInfo={id:string;html:string;tag:string;locked:boolean};
const allowed=new Set(['b','strong','em','i','u','s','span','br','sub','sup','a','p','ul','ol','li']);
const formatting=new Set(['color','background-color','font-family','font-size','font-weight','font-style','text-decoration','text-decoration-line','line-height','letter-spacing','text-align','vertical-align']);
export function createRichEditor(context:{selected:()=>ObjectInfo|undefined;key:()=>string;slideId:()=>string;commands:(commands:Command[])=>Promise<unknown>;capture:(ids:string[])=>Promise<{computedStyles:Record<string,Record<string,string>>}>}) {
  const trigger=document.createElement('button');trigger.id='open-rich-editor';trigger.textContent='编辑富文本';
  document.getElementById('selection-name')!.after(trigger);
  const dialog=document.createElement('dialog');dialog.id='rich-editor-dialog';dialog.setAttribute('aria-labelledby','rich-editor-title');
  dialog.innerHTML=`<header><h2 id="rich-editor-title">编辑文字与排版</h2><button id="rich-cancel" aria-label="关闭富文本编辑">×</button></header><div class="rich-toolbar" role="toolbar" aria-label="文字格式"><button data-rich-command="bold"><b>加粗</b></button><button data-rich-command="italic"><i>斜体</i></button><button data-rich-command="underline"><u>下划线</u></button><button data-rich-command="strikeThrough"><s>删除线</s></button><button data-rich-command="insertUnorderedList">项目符号</button><button data-rich-command="insertOrderedList">编号</button><button data-rich-command="indent">增加缩进</button><button data-rich-command="outdent">减少缩进</button><button data-rich-command="justifyLeft">左对齐</button><button data-rich-command="justifyCenter">居中</button><label>文字颜色<input id="rich-color" type="color" value="#6638dc"></label></div><div id="rich-surface" contenteditable="true" role="textbox" aria-label="富文本内容" aria-multiline="true" spellcheck="false"></div><p id="rich-editor-status" role="status">选中文字后应用格式。粘贴会保留文字内容。</p><footer><button id="rich-save" class="primary">保存文字</button><button id="rich-discard">取消</button></footer>`;
  document.body.append(dialog);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>dialog.querySelector<T>('#'+id)!;
  const editor=el('rich-surface');
  let selection:Range|undefined, key='', target='', slideId='', busy=false, generation=0;
  const originals=new Map<string,Element>();
  function source(object:ObjectInfo) {
    const doc=new DOMParser().parseFromString(object.html,'text/html');const root=doc.body.firstElementChild;
    if(!root||!['p','div','section','article','h1','h2','h3','h4','h5','h6','span','li','blockquote','a'].includes(object.tag))return;
    if([...root.querySelectorAll('*')].some(el=>!allowed.has(el.localName)))return;
    return root;
  }
  function render(){const object=context.selected();trigger.hidden=!object||!source(object);trigger.disabled=!!object?.locked;}
  function cleanDraft(root:Element) {
    for(const node of root.querySelectorAll<HTMLElement>('*')) {
      const id=node.getAttribute('data-notale-id');if(id)originals.set(id,node.cloneNode(true) as Element);
      for(const attr of [...node.attributes]) if(!['style','data-notale-id','href'].includes(attr.name))node.removeAttribute(attr.name);
      for(const property of [...node.style])if(!formatting.has(property))node.style.removeProperty(property);
    }
  }
  function serialize() {
    const draft=document.createElement('div');draft.innerHTML=editor.innerHTML;
    for(const node of draft.querySelectorAll<HTMLElement>('*')) {
      if(!allowed.has(node.localName))throw new Error('请使用文字、段落和列表编辑内容');
      const id=node.getAttribute('data-notale-id'),original=id?originals.get(id):undefined;
      const styles=new Map([...node.style].filter(p=>formatting.has(p)).map(p=>[p,node.style.getPropertyValue(p)]));
      for(const attr of [...node.attributes])node.removeAttribute(attr.name);
      if(original)for(const attr of [...original.attributes])if(attr.name!=='style')node.setAttribute(attr.name,attr.value);
      if(original?.getAttribute('style'))node.setAttribute('style',original.getAttribute('style')!);
      for(const property of formatting)node.style.removeProperty(property);
      for(const [property,value]of styles)node.style.setProperty(property,value);
    }
    return draft.innerHTML;
  }
  trigger.addEventListener('click',()=>{
    const object=context.selected();if(!object||object.locked)return;const root=source(object);if(!root)return;
    const blockEditing=['div','section','article','li','blockquote'].includes(object.tag);
    editor.dataset.blockEditing=String(blockEditing);
    for(const button of dialog.querySelectorAll<HTMLButtonElement>('[data-rich-command="insertUnorderedList"],[data-rich-command="insertOrderedList"],[data-rich-command="indent"],[data-rich-command="outdent"]'))button.disabled=!blockEditing;
    originals.clear();cleanDraft(root);editor.innerHTML=root.innerHTML;editor.removeAttribute('style');
    key=context.key();target=object.id;slideId=context.slideId();selection=undefined;
    el('rich-editor-status').textContent='选中文字后应用格式。粘贴会保留文字内容。';dialog.showModal();editor.focus();
    document.execCommand('defaultParagraphSeparator',false,'p');
    const request=++generation, capturedTarget=target;
    void context.capture([capturedTarget]).then(result=>{
      if(!dialog.open||request!==generation||key!==context.key())return;
      const style=result.computedStyles[capturedTarget]??{};
      for(const property of ['font-family','color','line-height','letter-spacing']) if(style[property])editor.style.setProperty(property,style[property]);
      editor.style.fontSize=Math.min(32,parseFloat(style['font-size'])||24)+'px';
    }).catch(()=>{});
  });
  document.addEventListener('selectionchange',()=>{
    if(!dialog.open)return;const current=document.getSelection();
    if(current?.rangeCount&&editor.contains(current.anchorNode)&&editor.contains(current.focusNode))selection=current.getRangeAt(0).cloneRange();
  });
  function format(command:string,value?:string) {
    editor.focus();if(selection){const current=document.getSelection()!;current.removeAllRanges();current.addRange(selection);}
    // Links retain their own UA color even when a surrounding span is colored.
    // Apply a color to fully selected links explicitly; partial selections remain browser ranges.
    const coloredLinks:HTMLAnchorElement[]=[];
    const active=document.getSelection();
    if(command==='foreColor'&&value&&active?.rangeCount) {
      const range=active.getRangeAt(0);
      for(const link of editor.querySelectorAll('a')) {
        const contents=document.createRange();contents.selectNodeContents(link);
        if(range.compareBoundaryPoints(Range.START_TO_START,contents)<=0&&range.compareBoundaryPoints(Range.END_TO_END,contents)>=0)coloredLinks.push(link);
      }
    }
    document.execCommand('styleWithCSS',false,'true');document.execCommand(command,false,value);
    for(const link of coloredLinks)if(editor.contains(link))link.style.color=value!;
    const current=document.getSelection();if(current?.rangeCount)selection=current.getRangeAt(0).cloneRange();
  }
  for(const button of dialog.querySelectorAll<HTMLElement>('[data-rich-command]')) {
    button.addEventListener('mousedown',event=>event.preventDefault());
    button.addEventListener('click',()=>format(button.dataset.richCommand!));
  }
  el('rich-color').addEventListener('change',()=>format('foreColor',el<HTMLInputElement>('rich-color').value));
  editor.addEventListener('keydown',event=>{if(event.key==='Enter'&&editor.dataset.blockEditing==='false'){event.preventDefault();document.execCommand('insertLineBreak');}});
  editor.addEventListener('paste',event=>{event.preventDefault();document.execCommand('insertText',false,event.clipboardData?.getData('text/plain')??'');});
  editor.addEventListener('drop',event=>event.preventDefault());
  editor.addEventListener('click',event=>{if((event.target as Element).closest('a'))event.preventDefault();});
  async function save(){
    if(busy)return;
    if(key!==context.key()){el('rich-editor-status').textContent='页面已变化，请关闭后重新打开文字编辑。';return;}
    busy=true;el<HTMLButtonElement>('rich-save').disabled=true;
    try{const html=serialize();await context.commands([{type:'element.patch',slideId,target,patch:{richText:html}}]);dialog.close();}
    catch(error){el('rich-editor-status').textContent=(error instanceof Error?error.message:String(error))+'；可关闭窗口后检查顶部的保存恢复操作。';}
    finally{busy=false;el<HTMLButtonElement>('rich-save').disabled=false;}
  }
  el('rich-save').addEventListener('click',()=>void save());
  for(const id of ['rich-cancel','rich-discard'])el(id).addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('keydown',event=>{event.stopPropagation();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();void save();}});
  return{render};
}
