export type CaptureVideoFrames=Record<string,{duration:number;frames:{time:number;uri:string}[]}>;
/** The export worker selects and decodes PTS frames; the browser only composites images. */
export class CaptureVideoImage {
  ready=false;private current='';private generation=0;private disposed=false;
  constructor(private image:HTMLImageElement,private frames:CaptureVideoFrames[string],private failure:(message:string)=>void){}
  prepare(time:number){
    if(this.disposed)return false;
    let low=0,high=this.frames.frames.length;
    while(low<high){const middle=(low+high)>>>1;if(this.frames.frames[middle].time<=time+1e-9)low=middle+1;else high=middle;}
    const selected=this.frames.frames[Math.max(0,low-1)];
    if(!selected||time>=this.frames.duration+1e-7){this.failure('导出视频帧不在固定帧源中');return false;}
    if(selected.uri!==this.current){this.current=selected.uri;this.ready=false;const generation=++this.generation;this.image.src=selected.uri;
      void this.image.decode().then(()=>{if(!this.disposed&&generation===this.generation)this.ready=true;},error=>{if(!this.disposed&&generation===this.generation)this.failure('导出视频帧载入失败：'+String(error));});}
    return this.ready;
  }
  dispose(){this.disposed=true;this.generation++;}
}
