export type ChartProperty = ChartPropertyGroup | ChartPropertyField | ChartPropertyButton | {kind:'text';text:string;className:string};
export interface ChartPropertyGroup {kind:'group';className:string;title?:string;open?:boolean;children:ChartProperty[];}
export interface ChartPropertyField {kind:'field';label:string;value:unknown;options?:Record<string,string>|'number'|'color'|'checkbox';change:(value:any)=>void;}
export interface ChartPropertyButton {kind:'button';label:string;colors?:string[];run:()=>unknown;}
const empty={key:'',visible:false,locked:false,nodes:[] as ChartProperty[]};let model=empty,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:typeof model){model=next;for(const listener of listeners)listener();}
export const chartPropertiesState={getSnapshot:()=>model,getServerSnapshot:()=>empty,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindChartProperties(){const identity=Symbol('chart-properties');owner=identity;publish(empty);return {
 update(key:string,nodes:ChartProperty[],locked:boolean){if(owner===identity)publish({key,nodes,locked,visible:true});},
 hide(){if(owner===identity)publish({...model,visible:false});},
 dispose(){if(owner===identity){owner=undefined;publish(empty);}},
};}
