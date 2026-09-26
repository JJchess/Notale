export interface ImportedDocument {id:string;skipped?:number;}
export async function importDocument(file:File,kind:'project'|'pptx',context:{api:(url:string,data:unknown)=>Promise<any>;upload:(bytes:Uint8Array,mime:string)=>Promise<unknown>;active:()=>boolean}):Promise<ImportedDocument>{
 const check=()=>{if(!context.active())throw Error('编辑会话已关闭');};
 check();const bytes=new Uint8Array(await file.arrayBuffer());check();
 if(kind==='project'){
  const result=await context.api('/api/import',file);return {id:result.document.id};
 }
 const {parsePptx}=await import('./pptx-import');check();const deck=parsePptx(bytes);if(!deck.slides.length)throw Error('这份 PPTX 里没有可导入的页面');
 const id=crypto.randomUUID(),assets:Record<string,unknown>={},slides=[];
 for(const [index,page]of deck.slides.entries()){
  check();let html=page.html;
  for(const item of page.media){check();assets[item.path]=await context.upload(item.bytes,item.mime);html=html.replaceAll(item.path,item.path.split('/').map(encodeURIComponent).join('/'));}
  slides.push({id:crypto.randomUUID(),name:page.name,sourcePath:`page-${String(index+1).padStart(2,'0')}.html`,html});
 }
 check();const result=await context.api('/api/documents',{schemaVersion:1,id,title:file.name.replace(/\.pptx$/i,'')||'导入的演示文稿',width:deck.width,height:deck.height,slides,assets});return {id:result.document?.id??id,skipped:deck.skipped};
}
