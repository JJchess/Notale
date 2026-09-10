// One worker per exec cell. RPC is the only advertised tool interface.
// vm is an execution compartment, NOT a security sandbox. Run the host in a
// container/jail when executing untrusted model code.
import vm from 'node:vm';
import readline from 'node:readline';
const send = value => process.stdout.write(JSON.stringify(value)+'\n');
const pending = new Map();
let sequence = 0;
function rpc(name, args) {
  const id = ++sequence;
  send({type:'tool', id, name, args});
  return new Promise((resolve,reject)=>pending.set(id,{resolve,reject}));
}
let started = false;
const reader = readline.createInterface({input:process.stdin});
reader.on('line', async line => {
  const message = JSON.parse(line);
  if (message.type === 'result') {
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(message.error)) : task.resolve(message.value);
    return;
  }
  if (started || message.type !== 'start') return;
  started = true;
  const memory = new Map(Object.entries(message.memory || {}));
  const emitText = value => send({type:'content', content:{type:'input_text',text:typeof value==='string'?value:JSON.stringify(value)??'undefined'}});
  const emitImage = (value,detail) => {
    const url = typeof value==='string'?value:value.image_url || `data:${value.mimeType};base64,${value.data}`;
    if (!url.startsWith('data:image/')) throw new Error('image() requires image data URL');
    send({type:'content',content:{type:'input_image',image_url:url,detail:detail||value.detail||'auto'}});
  };
  const tools = Object.fromEntries(message.tools.map(name=>[name,args=>rpc(name,args)]));
  const context = vm.createContext({tools, text:emitText, image:emitImage,
    generatedImage: value=>{emitImage(value);if(value.output_hint)emitText(value.output_hint);},
    store:(key,value)=>{memory.set(key,value);send({type:'store',key,value});},
    load:key=>memory.get(key),
    notify:emitText,
    yield_control:async()=>send({type:'yield'}),
    setTimeout,clearTimeout,
    ALL_TOOLS:message.tools.map(name=>({name,description:message.descriptions?.[name]||''})),
    exit:()=>{throw new Error('__CELL_EXIT__');},
  }, {codeGeneration:{strings:false,wasm:false}});
  try {
    await new vm.Script(`(async()=>{\n${message.code}\n})()`,{filename:'exec-cell.js'}).runInContext(context);
    send({type:'done'});
  } catch(error) {
    if(error.message==='__CELL_EXIT__')send({type:'done'});
    else send({type:'error',error:String(error.stack||error)});
  }
  // Match fresh-cell lifetime: unawaited promises/timers cannot keep it alive.
  // Flush queued frames first: immediate process.exit truncates large images.
  await new Promise(resolve=>process.stdout.write('',resolve));
  reader.close();
  process.exit(0);
});
