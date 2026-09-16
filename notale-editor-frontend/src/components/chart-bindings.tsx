'use client';
import {useRef,useState,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {chartBindingsState,type ChartBindings,type ChartBindingField} from '../state/chart-bindings';
export function ChartBindingsView(){const model=useSyncExternalStore(chartBindingsState.subscribe,chartBindingsState.getSnapshot,chartBindingsState.getServerSnapshot);return model?createPortal(<Bindings model={model}/>,model.container):null;}
function Bindings({model}:{model:ChartBindings}){
 const [error,setError]=useState('');
 function run(action:()=>void){setError('');try{action();}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}}
 return <>{model.fields.map(field=><label key={field.label} className="chart-field"><span>{field.label}</span>{field.options?<select aria-label={field.label} value={field.value} onChange={event=>run(()=>field.change(event.target.value))}>{!Object.hasOwn(field.options!,field.value)&&<option value={field.value}/>}{Object.entries(field.options!).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<BindingText field={field} run={run}/>}</label>)}{model.actions.map(action=><button key={action.label} type="button" title={action.label} onClick={()=>run(action.run)}>{action.label}</button>)}{model.hint&&<span className="hint">{model.hint}</span>}{error&&<span role="status">{error}</span>}</>;
}

function BindingText({field,run}:{field:ChartBindingField;run:(action:()=>void)=>void}){
 const submit=useRef(field.change);
 return <input aria-label={field.label} autoFocus defaultValue={field.value} onFocus={()=>{submit.current=field.change;}} onBlur={event=>run(()=>submit.current(event.target.value))} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/>;
}
