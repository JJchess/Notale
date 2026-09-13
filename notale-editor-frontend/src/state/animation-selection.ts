/** Animation focus belongs to the editing session, not to a transient render snapshot. */
export class AnimationSelection {
 selected:string|undefined;
 private scope='';
 private key(documentId:string,pageId:string,targets:string[]){return JSON.stringify([documentId,pageId,[...targets].sort()]);}
 sync(documentId:string,pageId:string,targets:string[],animations:{id:string;target:string}[]){
  const scope=this.key(documentId,pageId,targets);if(scope===this.scope)return false;
  this.scope=scope;this.selected=targets.length===1?animations.find(animation=>animation.target===targets[0])?.id:undefined;return true;
 }
 select(id:string|undefined,documentId:string,pageId:string,targets:string[]){this.scope=this.key(documentId,pageId,targets);this.selected=id;}
}
