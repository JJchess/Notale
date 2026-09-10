/** Imported pages have a stage; static master drafts use the authoring viewport. */
export function stageBounds(width:number,height:number):DOMRect {
 return document.getElementById('stage')?.getBoundingClientRect() ?? new DOMRect(0,0,width,height);
}
