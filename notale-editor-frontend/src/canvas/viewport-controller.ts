import {bindViewportView} from '../state/viewport-view';
/** Owns viewport geometry and gestures; UI subscribes to viewport-view. */
export function createViewportController(context:{viewport:HTMLElement;stage:HTMLElement;canvas:HTMLElement;panSurface:HTMLElement;frame:()=>HTMLIFrameElement;onZoom:(scale:number)=>void}){
  const events = new AbortController();
  let disposed = false;
  const pendingFrames = new Set<number>();
  function schedule(callback:FrameRequestCallback){
    if(disposed)return 0;
    const id=requestAnimationFrame(time=>{pendingFrames.delete(id);if(!disposed)callback(time);});
    pendingFrames.add(id);return id;
  }
  const {viewport,stage,canvas,panSurface}=context;
  let dimensions = { width: 1600, height: 900 };
  let zoom: number | 'fit' = 'fit';
  let actualZoom = 1;
  let hand = false;
  let drag: { pointer: number; x: number; y: number; left: number; top: number } | undefined;

  function layout(preserveCenter = true) {
    if(disposed)return;
    const w = viewport.clientWidth, h = viewport.clientHeight;
    if (!w || !h) return;
    const oldW = canvas.offsetWidth, oldH = canvas.offsetHeight;
    const centerX = (viewport.scrollLeft + w / 2 - canvas.offsetLeft) / (oldW || 1);
    const centerY = (viewport.scrollTop + h / 2 - canvas.offsetTop) / (oldH || 1);
    actualZoom = zoom === 'fit'
      ? Math.max(0.01, Math.min((w - 48) / dimensions.width, (h - 48) / dimensions.height))
      : zoom;
    const width = dimensions.width * actualZoom, height = dimensions.height * actualZoom;
    stage.style.width = Math.max(w, width + 48) + 'px';
    stage.style.height = Math.max(h, height + 48) + 'px';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const frame = context.frame();
    frame.style.width = dimensions.width + 'px';
    frame.style.height = dimensions.height + 'px';
    frame.style.transformOrigin = '0 0';
    frame.style.transform = `scale(${actualZoom})`;
    context.onZoom(actualZoom);
    view.update({mode:zoom,actual:actualZoom,fit:Math.max(.01,Math.min((w-48)/dimensions.width,(h-48)/dimensions.height)),hand});
    if (zoom === 'fit' || !preserveCenter) viewport.scrollTo(0, 0);
    else viewport.scrollTo(
      canvas.offsetLeft + centerX * width - w / 2,
      canvas.offsetTop + centerY * height - h / 2,
    );

  }
  function changeZoom(value: number | 'fit') {
    if(disposed||value!=='fit'&&!Number.isFinite(value))return;
    zoom = value === 'fit' ? value : Math.max(0.1, Math.min(16, value));
    layout();
  }
  const view=bindViewportView({zoom:changeZoom,hand:setHand});
  const observer = new ResizeObserver(() => layout());
  observer.observe(viewport);
  let zoomFrame = 0, wheelDelta = 0, wheelAnchor: {x:number;y:number;clientX:number;clientY:number} | undefined;
  function wheelZoom(clientX:number,clientY:number,delta:number) {
    if(disposed)return;
    const rect=viewport.getBoundingClientRect();
    wheelAnchor={x:(viewport.scrollLeft+clientX-rect.left-canvas.offsetLeft)/actualZoom,y:(viewport.scrollTop+clientY-rect.top-canvas.offsetTop)/actualZoom,clientX:clientX-rect.left,clientY:clientY-rect.top};
    wheelDelta+=delta;
    if(!zoomFrame)zoomFrame=schedule(()=>{
      zoomFrame=0;const anchor=wheelAnchor!;const next=actualZoom*Math.exp(-wheelDelta*.002);wheelDelta=0;changeZoom(next);
      viewport.scrollTo(canvas.offsetLeft+anchor.x*actualZoom-anchor.clientX,canvas.offsetTop+anchor.y*actualZoom-anchor.clientY);
    });
  }
  viewport.addEventListener('wheel', event => {
    if(!event.ctrlKey && !event.metaKey)return;
    event.preventDefault();wheelZoom(event.clientX,event.clientY,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1));
  },{...({passive:false}),signal:events.signal});

  function endPan() {
    const pointer = drag?.pointer;
    drag = undefined;
    viewport.classList.remove('panning');
    if (pointer !== undefined && viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
  }
  function setHand(value: boolean) {
    if(disposed)return;
    endPan();
    hand = value;
    panSurface.hidden = !hand;
    view.update({mode:zoom,actual:actualZoom,fit:Math.max(.01,Math.min((viewport.clientWidth-48)/dimensions.width,(viewport.clientHeight-48)/dimensions.height)),hand});
    viewport.classList.toggle('hand-mode', hand);
  }
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (!hand && event.target !== viewport && event.target !== stage)) return;
    event.preventDefault();
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('panning');
    viewport.focus({ preventScroll: true });
  }, {signal:events.signal});
  viewport.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    viewport.scrollTo(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
  }, {signal:events.signal});
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, endPan, {signal:events.signal});
  window.addEventListener('blur',()=>setHand(false), {signal:events.signal});
  window.addEventListener('keydown',event=>{if(event.isComposing||event.code!=='Space'||(event.target as Element)?.closest('input,textarea,select,button,a,summary,[contenteditable],dialog'))return;event.preventDefault();setHand(true);},{capture:true,signal:events.signal});
  window.addEventListener('keyup',event=>{if(event.code==='Space')setHand(false);},{capture:true,signal:events.signal});
  viewport.addEventListener('keydown', event => {
    if (event.key === 'Escape') { setHand(false); event.stopPropagation(); }
  }, {signal:events.signal});

  return {
    dispose(){
      if(disposed)return;
      setHand(false);
      disposed=true;
      events.abort();observer.disconnect();view.dispose();
      for(const id of pendingFrames)cancelAnimationFrame(id);
      pendingFrames.clear();zoomFrame=0;wheelAnchor=undefined;wheelDelta=0;
    },
    wheel(x:number,y:number,delta:number) {
      if(![x,y,delta].every(Number.isFinite))return;
      const rect=context.frame().getBoundingClientRect();wheelZoom(rect.left+x*actualZoom,rect.top+y*actualZoom,delta);
    },
    hand:setHand,
    pan(x:number,y:number){if(!disposed&&[x,y].every(Number.isFinite))viewport.scrollBy(x,y);},
    zoom: () => actualZoom,
    render(width: number, height: number) {
      if(disposed)return;
      const changed = width !== dimensions.width || height !== dimensions.height;
      dimensions = { width, height };
      layout(!changed);
    },
  };
}
