/** React owns hosts; each canvas controller subscribes for its own lifetime. */
export interface ThumbnailHost {element:HTMLElement;documentId:string;pageId:string;}
const hosts=new Set<ThumbnailHost>();
const listeners=new Set<(host:ThumbnailHost,mounted:boolean)=>void>();
export function registerThumbnailHost(host:ThumbnailHost){
 hosts.add(host);for(const listener of listeners)listener(host,true);
 return ()=>{if(!hosts.delete(host))return;for(const listener of listeners)listener(host,false);};
}
export function observeThumbnailHosts(listener:(host:ThumbnailHost,mounted:boolean)=>void){
 listeners.add(listener);for(const host of hosts)listener(host,true);
 return ()=>{listeners.delete(listener);};
}
