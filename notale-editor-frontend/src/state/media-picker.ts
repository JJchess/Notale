let open:((kind:string)=>void)|undefined;
/** The React-owned file input keeps the native picker in the initiating user gesture. */
export function bindMediaPicker(choose:(kind:string)=>void){open=choose;return()=>{if(open===choose)open=undefined;};}
export function requestMediaFile(kind:string){if(!open)throw Error('媒体选择器尚未就绪');open(kind);}
