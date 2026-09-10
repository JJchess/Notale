type ObjectInfo = { id: string; parent?: string; tag: string; text: string; locked: boolean; attributes: Record<string, string> };
export function createContextInspector() {
  const el = (id: string) => document.getElementById(id)!;
  const panel = document.querySelector<HTMLElement>('[data-panel="format"]')!;
  const empty = document.createElement('p');
  empty.id = 'property-empty';
  empty.className = 'property-empty';
  empty.textContent = '选择画布上的对象，编辑它的内容、外观和位置。';
  el('selection-name').after(empty);
  function group(id: string, title: string, collapsible = false) {
    const node = document.createElement(collapsible ? 'details' : 'fieldset');
    node.id = id;
    node.className = 'property-group';
    const heading = document.createElement(collapsible ? 'summary' : 'legend');
    heading.textContent = title;
    node.append(heading);
    panel.append(node);
    return node;
  }
  function move(parent: HTMLElement, ids: string[]) {
    for (const id of ids) {
      const control = el(id);
      parent.append(['INPUT', 'TEXTAREA', 'SELECT'].includes(control.tagName) ? control.closest('label') ?? control : control);
    }
  }
  const text = group('property-text', '文字');
  move(text, ['object-text', 'apply-text']);
  const typography = document.createElement('div');
  typography.className = 'field-grid';
  move(typography, ['font-size', 'color']);
  text.append(typography);
  const typeActions = document.createElement('div');
  typeActions.className = 'inline';
  move(typeActions, ['bold', 'italic']);
  const saveType = document.createElement('button');
  saveType.id = 'apply-typography';
  saveType.textContent = '应用文字样式';
  typeActions.append(saveType);
  text.append(typeActions);
  move(text, ['text-reflow']);
  const geometry = group('property-geometry', '位置与尺寸');
  const grid = el('tx').closest<HTMLElement>('.field-grid')!;
  geometry.append(grid);
  move(geometry, ['apply-format']);
  el('apply-format').textContent = '应用位置与尺寸';
  const arrangement = group('property-arrange', '排列与对齐', true);
  move(arrangement, ['arrange-reference', 'arrange-tools', 'group-angle', 'group-factor', 'rotate-group', 'scale-group', 'front', 'back', 'layer-forward', 'layer-backward']);
  const identity = group('property-identity', '名称与可见性', true);
  move(identity, ['object-name', 'save-object-name', 'hide-objects', 'show-objects', 'lock']);
  const binding = group('property-binding', '互动初始值');
  move(binding, ['binding-value', 'save-binding']);
  const components = group('property-components', '组件与状态', true);
  components.append(el('author-components'));
  const advanced = el('style-json').closest('details')!;
  advanced.id = 'property-advanced';
  advanced.querySelector('summary')!.textContent = '高级：源样式与数据';
  // Put task-relevant controls above the inherited detailed integrations.
  empty.after(text, el('media-panel'), el('connector-panel'), el('scene-panel'), el('native-chart-panel'), binding, geometry, arrangement, identity, components, advanced);
  for (const node of panel.querySelectorAll('.inline, .field-grid')) if (!node.children.length) node.remove();
  return {
    render(objects: ObjectInfo[], ids: string[]) {
      const selected = objects.filter(o => ids.includes(o.id));
      const one = selected.length === 1 ? selected[0] : undefined;
      const has = selected.length > 0;
      const locked = selected.some(o => o.locked);
      // A parent replacement destroys its children. Plain-text replacement is offered only for leaves.
      const byId = new Map(objects.map(o => [o.id, o]));
      const atomic = (o: ObjectInfo) => { for (let p = o.parent ? byId.get(o.parent) : undefined; p; p = p.parent ? byId.get(p.parent) : undefined) if (p.attributes['data-notale-tex'] !== undefined || p.attributes['data-notale-chart'] !== undefined) return true; return false; };
      const isText = (o: ObjectInfo) => /^(h[1-6]|p|pre|span|a|button|label|li|td|th|blockquote|text|tspan)$/.test(o.tag) && !objects.some(child => child.parent === o.id) && !atomic(o);
      text.hidden = !selected.length || !selected.every(isText);
      (text as HTMLFieldSetElement).disabled = locked;
      el('object-text').closest<HTMLElement>('label')!.hidden = !one;
      el('apply-text').hidden = !one;
      binding.hidden = !one || !['input', 'select', 'textarea'].includes(one.tag);
      (binding as HTMLFieldSetElement).disabled = locked;
      empty.hidden = has;
      for (const group of [geometry, arrangement, identity, advanced]) group.hidden = !has;
      (geometry as HTMLFieldSetElement).disabled = locked;
      el('selection-name').textContent = !has ? '对象属性' : selected.length > 1 ? `已选择 ${selected.length} 个对象` : `${one!.attributes['data-notale-name'] || (one!.attributes['data-notale-shape'] ? '形状' : one!.attributes['data-notale-icon'] ? '图标' : one!.attributes['data-notale-smart'] ? '图示' : one!.attributes['data-notale-tex'] !== undefined ? '公式' : '') || ({img:'图片', video:'视频',audio:'音频',canvas:'互动画布',svg:'图形'} as Record<string,string>)[one!.tag] || (isText(one!) ? '文字' : '对象')}${locked ? ' · 已锁定' : ''}`;
      const label = panel.querySelector<HTMLElement>('#property-lock-hint') ?? document.createElement('p');
      label.id = 'property-lock-hint'; label.className = 'hint';
      label.textContent = '对象已锁定。在“名称与可见性”中解锁后可编辑。';
      label.hidden = !locked;
      if (!label.parentElement) el('selection-name').after(label);
    },
  };
}
