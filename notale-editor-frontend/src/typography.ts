import {bindPropertyInput,type PropertyTransactions} from './property-input.js';
import type { Command } from '@notale/editor/browser';
export function createTypography(context: PropertyTransactions & {
  key: () => string;
  ready: () => boolean;
  ids: () => string[];
  slideId: () => string;
  capture: (ids: string[]) => Promise<{computedStyles: Record<string, Record<string,string>>}>;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;
  const text = document.getElementById('property-text')!;
  const grid = document.createElement('div'); grid.className = 'field-grid';
  grid.innerHTML = `<label class="full-field">字体<input id="font-family" list="font-families" placeholder="沿用页面字体"><datalist id="font-families"><option value="system-ui"><option value="Arial"><option value="Georgia"><option value="'Microsoft YaHei'"><option value="'PingFang SC'"></datalist></label><label>行高 px<input id="line-height" type="number" min="1" step="any" placeholder="自动"></label><label>字距 px<input id="letter-spacing" type="number" step="any" placeholder="正常"></label><label class="full-field">段落对齐<select id="text-align"><option value="">多种值</option><option value="start">起始端</option><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option><option value="justify">两端对齐</option><option value="end">末尾端</option></select></label>`;
  grid.insertAdjacentHTML('beforeend','<label class="full-field">文字方向<select id="writing-mode"><option value="">多种值</option><option value="horizontal-tb">横排</option><option value="vertical-rl">竖排 · 从右到左</option><option value="vertical-lr">竖排 · 从左到右</option></select></label>');
  document.getElementById('apply-typography')!.closest('.inline')!.before(grid);
  const status = document.createElement('p'); status.id='typography-status'; status.className='hint'; status.setAttribute('role','status'); text.append(status);
  const reset = document.createElement('button'); reset.id='reset-typography'; reset.textContent='恢复页面文字样式'; text.append(reset);
  const fields = ['font-family','font-size','color','line-height','letter-spacing','text-align','writing-mode'];
  let key = '', generation = 0;
  function colorHex(value: string) {
    const numbers = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    return numbers ? '#' + numbers.slice(1,4).map(n => Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('') : value;
  }
  function display(property: string, value: string) {
    if (property === 'color') return colorHex(value);
    if (['font-size','line-height','letter-spacing'].includes(property)) return value === 'normal' ? '' : String(parseFloat(value));
    return value;
  }
  function render() {
    const next = context.key();
    if (text.hidden || !context.ready()) { key=''; generation++; return; }
    if (next === key) return;
    key = next;
    const token = ++generation;
    const ids = context.ids();
    for (const id of ['font-family','line-height','letter-spacing','text-align','writing-mode']) { input(id).value=''; input(id).dataset.initial=''; }
    const before = Object.fromEntries(fields.map(id => [id,input(id).value]));
    status.textContent='正在读取页面文字样式…';
    void context.capture(ids).then(capture => {
      if (token !== generation || context.key() !== next) return;
      let mixed = false;
      for (const field of fields) {
        const values = ids.map(id => capture.computedStyles[id]?.[field] ?? '');
        const varied = values.some(value => value !== values[0]);
        mixed ||= varied;
        const control = input(field);
        if (control===document.activeElement || control.value !== before[field]) continue;
        const value = varied ? '' : display(field, values[0]);
        if (field !== 'color' || value) control.value = value;
        control.dataset.initial = control.value;
        control.dataset.mixed = String(varied);
        control.title = varied ? '所选对象使用不同的值；修改后统一应用' : '';
        if (field !== 'color') control.placeholder = varied ? '多种值' : field === 'line-height' ? '自动' : field === 'letter-spacing' ? '正常' : '';
      }
      for (const [id, property] of [['bold','font-weight'],['italic','font-style']] as const) {
        const values = ids.map(id => capture.computedStyles[id]?.[property]);
        const active = values.map(value => property === 'font-weight' ? Number(value) >= 600 || value === 'bold' : value === 'italic' || value === 'oblique');
        document.getElementById(id)!.setAttribute('aria-pressed', active.some(v => v !== active[0]) ? 'mixed' : String(active[0]));
      }
      status.textContent = mixed ? '已读取实际样式 · 所选文字含多种值，仅修改的项目会统一应用。' : '已读取页面实际样式 · 仅保存你修改的项目。';
    }).catch(() => {
      if (token === generation) { key=''; status.textContent='暂未读取到页面样式，重新选择对象可重试。'; }
    });
  }
  function save(style: Record<string,string>) {
    if (!Object.keys(style).length) return;
    return context.commands(context.ids().map(target => ({type:'element.patch',slideId:context.slideId(),target,patch:{style}})));
  }
  for(const id of fields){
    const control=input(id);
    const read=():Command[]=>{
      if(!control.validity.valid)return [];
      const value=control.value===''?'':['font-size','line-height','letter-spacing'].includes(id)?Number(control.value)+'px':control.value;
      const style:Record<string,string>={[id]:value};if(id==='writing-mode')style['text-orientation']=value.startsWith('vertical')?'upright':'mixed';
      return context.ids().map(target=>({type:'element.patch',slideId:context.slideId(),target,patch:{style}}));
    };
    if(['color','range','number'].includes(control.type))bindPropertyInput(control,read,context);
    else control.addEventListener('change',()=>{control.dataset.initial=control.value;void context.commands(read()).catch(context.error);});
  }
  return {
    render,
    apply() {
      const style: Record<string,string> = {};
      for (const id of fields) {
        const control=input(id);
        if (control.value === control.dataset.initial) continue;
        if (!control.validity.valid) throw new Error('请检查字号、行高和字距的输入值');
        style[id] = control.value === '' ? '' : ['font-size','line-height','letter-spacing'].includes(id) ? `${Number(control.value)}px` : control.value;
      }
      if(style['writing-mode'] !== undefined)style['text-orientation']=style['writing-mode'].startsWith('vertical')?'upright':'mixed';
      return save(style);
    },
    toggle(id:'bold'|'italic') {
      const active = document.getElementById(id)!.getAttribute('aria-pressed') === 'true';
      return save(id === 'bold' ? {'font-weight': active ? '400' : '700'} : {'font-style': active ? 'normal' : 'italic'});
    },
    reset() { return save(Object.fromEntries([...fields,'font-weight','font-style','text-orientation'].map(id=>[id,'']))); },
  };
}
