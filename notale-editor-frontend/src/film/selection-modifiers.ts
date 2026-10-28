export type SelectionModifiers={shiftKey:boolean;ctrlKey:boolean;metaKey:boolean};
export const additiveSelection=(event:SelectionModifiers)=>event.shiftKey||event.ctrlKey||event.metaKey;
/** A stable anchor lets repeated Shift clicks grow AND shrink the same range.
 * External selection changes establish a fresh anchor instead of reviving stale IDs. */
export class ClickSelection {
 private anchor?:string;private base:string[]=[];private previous=new Set<string>();private toggled=false;
 reset(){this.anchor=undefined;this.base=[];this.previous.clear();this.toggled=false;}
 accept(ids:readonly string[]){this.previous=new Set(ids);if(this.toggled){this.base=[...ids];this.toggled=false;}}
 click(order:readonly string[],current:readonly string[],id:string,event:SelectionModifiers,primary?:string):string[]{
  const allowed=new Set(order);if(!allowed.has(id))return [...current];
  if(!this.anchor||!allowed.has(this.anchor)||current.length!==this.previous.size||current.some(value=>!this.previous.has(value))){this.anchor=primary&&allowed.has(primary)?primary:current.filter(value=>allowed.has(value)).at(-1);this.base=current.filter(value=>allowed.has(value)&&value!==this.anchor);}
  let next:string[];
  if(event.shiftKey&&this.anchor&&allowed.has(this.anchor)){const a=order.indexOf(this.anchor),b=order.indexOf(id);next=[...new Set([...this.base.filter(value=>allowed.has(value)),...order.slice(Math.min(a,b),Math.max(a,b)+1)])];this.toggled=false;}
  else if(event.ctrlKey||event.metaKey){next=current.includes(id)?current.filter(value=>value!==id):[...current,id];this.anchor=id;this.base=[...next];this.toggled=true;}
  else{next=[id];this.anchor=id;this.base=[];this.toggled=false;}
  this.previous=new Set(next);return next;
 }
}
