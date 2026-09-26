import {isLocale,translateMessage,type Locale} from '../i18n/index.js';
const bindings=new Set<{node:WeakRef<Element>;attribute:string;source:string}>();
function locale():Locale{const value=(window as unknown as {__NOTALE__?:{locale?:unknown}}).__NOTALE__?.locale;return isLocale(value)?value:'zh-CN';}
/** Bind only runtime-owned controls; authored slide nodes never enter this registry. */
export function runtimeLabel(node:Element,source:string,attribute='aria-label'){
 if(bindings.size>128)for(const binding of bindings){const target=binding.node.deref();if(!target||!target.isConnected)bindings.delete(binding);}
 bindings.add({node:new WeakRef(node),attribute,source});
 const value=translateMessage(locale(),source);if(attribute==='textContent')node.textContent=value;else node.setAttribute(attribute,value);
}
export function copyRuntimeLabel(from:Element,to:Element){for(const binding of bindings){if(binding.node.deref()===from&&binding.attribute==='aria-label'){runtimeLabel(to,binding.source,'textContent');return;}}}
if(typeof window!=='undefined')window.addEventListener('notale-locale-change',()=>{for(const binding of bindings){const node=binding.node.deref();if(!node||!node.isConnected){bindings.delete(binding);continue;}const value=translateMessage(locale(),binding.source);if(binding.attribute==='textContent')node.textContent=value;else node.setAttribute(binding.attribute,value);}});
