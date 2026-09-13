export interface CanvasPreview {
  channel:string;version:number;expiresAt:number;renewAfterMs:number;
  slides:{id:string;url:string}[];
}
type Request = <T>(path:string)=>Promise<T>;
/** Revision-fenced, bounded resources. Rejected requests never poison the cache. */
export class CanvasResources<T> {
  private key='';
  private disposed=false;
  private preview?:Promise<CanvasPreview>;
  private objects=new Map<string,Promise<T>>();
  constructor(private request:Request,private capacity=3){}
  private revision(documentId:string,version:number){
    const key=`${documentId}:${version}`;
    if(key!==this.key){this.key=key;this.preview=undefined;this.objects.clear();}
    return `/api/documents/${encodeURIComponent(documentId)}`;
  }
  getPreview(documentId:string,version:number){
    if(this.disposed)return Promise.reject<CanvasPreview>(Error('画布资源已关闭'));
    const base=this.revision(documentId,version);
    if(!this.preview){const request=this.request<CanvasPreview>(`${base}/preview?version=${version}`);this.preview=request;void request.catch(()=>{if(this.preview===request)this.preview=undefined;});}
    return this.preview;
  }
  getObjects(documentId:string,version:number,pageId:string){
    if(this.disposed)return Promise.reject<T>(Error('画布资源已关闭'));
    const base=this.revision(documentId,version);
    let request=this.objects.get(pageId);
    if(request)this.objects.delete(pageId);
    else {request=this.request<T>(`${base}/slides/${encodeURIComponent(pageId)}/objects?version=${version}`);const pending=request;void request.catch(()=>{if(this.objects.get(pageId)===pending)this.objects.delete(pageId);});}
    this.objects.set(pageId,request);
    while(this.objects.size>this.capacity)this.objects.delete(this.objects.keys().next().value!);
    return request;
  }
  dispose(){this.disposed=true;this.clear();}
  clear(){this.key='';this.preview=undefined;this.objects.clear();}
}
