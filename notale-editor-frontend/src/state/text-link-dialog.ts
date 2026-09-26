export interface TextLinkRequest {id:number;apply:(value:string)=>void;}
let current:TextLinkRequest|undefined,sequence=0;
const listeners=new Set<()=>void>();
function publish(next:TextLinkRequest|undefined){current=next;listeners.forEach(listener=>listener());}
export const textLinkState={getSnapshot:()=>current,getServerSnapshot:()=>undefined,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function closeTextLink(source:TextLinkRequest){if(current===source)publish(undefined);}
export function applyTextLink(source:TextLinkRequest,value:string){
 if(current!==source)throw Error('链接窗口已关闭');
 source.apply(value);closeTextLink(source);
}
export function createTextLinkDialog(){
 let owned:TextLinkRequest|undefined,disposed=false;
 return {
  open(apply:TextLinkRequest['apply']){if(disposed)return;owned={id:++sequence,apply};publish(owned);},
  dispose(){disposed=true;if(owned)closeTextLink(owned);owned=undefined;},
 };
}
