const KEY='notale-tool-panel-width';
const DEFAULT=300;
export const MIN_WIDTH=260;
export function maxWidth(){return Math.min(640,Math.round((typeof window==='undefined'?1280:window.innerWidth)*.5));}
function stored(){try{const value=Number(localStorage.getItem(KEY));return Number.isFinite(value)&&value>0?clamp(value):DEFAULT;}catch{return DEFAULT;}}
export function clamp(width:number){return Math.max(MIN_WIDTH,Math.min(width,Math.max(MIN_WIDTH,maxWidth())));}
let model={width:DEFAULT};const initial=model,listeners=new Set<()=>void>();
export const toolPanelState={
 getSnapshot:()=>model,
 getServerSnapshot:()=>initial,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
};
export const toolPanelActions={
 resize(width:number){if(!Number.isFinite(width))return;const next=clamp(width);if(next===model.width)return;model={width:next};for(const listener of listeners)listener();},
 restore(){toolPanelActions.resize(stored());},
 persist(){try{localStorage.setItem(KEY,String(model.width));}catch{}},
};
