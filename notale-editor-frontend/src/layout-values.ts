import type { Slide, DeckDocument, Command, Asset } from '@notale/editor/browser';
export function createLayoutValues(context: {
  mount: HTMLElement;
  slide: () => Slide;
  document: () => DeckDocument;
  selected: () => string[];
  commands: (commands: Command[]) => Promise<unknown>;
  error: (error: unknown) => void;
  uploadImage: (file: File) => Promise<{ path: string; asset: Asset }>;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'layout-values';
  panel.innerHTML =
    '<legend>本页版式内容</legend><div id="layout-value-fields"></div><button id="save-layout-values">保存本页内容</button><button id="reset-layout-values">恢复母版默认文字</button><div id="layout-placeholder-author"><label>逐页内容标识<input id="placeholder-key" placeholder="例如 title 或 explanation"></label><label>名称<input id="placeholder-label" placeholder="例如 本页标题"></label><button id="set-layout-placeholder">将选中对象设为逐页内容</button></div>';
  context.mount.append(panel);
  const fields = panel.querySelector('#layout-value-fields')!,
    author = panel.querySelector<HTMLElement>('#layout-placeholder-author')!;
  let key = '',boundPage='',boundState='';
  const state=()=>{const page=context.slide();return JSON.stringify([page.layoutId,page.layoutValues,page.layoutImages,context.document().layouts.find(l=>l.id===page.layoutId)]);};
  const validate=()=>{if(boundPage!==context.slide().id||boundState!==state())throw Error('本页母版内容已变化，输入已保留，请重新打开页面设置后核对');};
  const run = (id: string, action: () => Promise<unknown>) =>
    (panel.querySelector<HTMLButtonElement>('#' + id)!.onclick = () => {
      panel.disabled = true;
      void action()
        .catch(context.error)
        .finally(() => {
          panel.disabled = false;
          render();
        });
    });
  function render() {
    const page = context.slide(),
      layout = context.document().layouts.find((item) => item.id === page.layoutId);
    author.hidden = !page.layoutSourceId;
    const next = JSON.stringify([page.id, layout, page.layoutValues, page.layoutImages]);
    if (next === key) return;
    if(boundPage===page.id&&[...fields.querySelectorAll<HTMLTextAreaElement>('textarea')].some(i=>i.value!==i.dataset.baseline))return;
    key=next;boundPage=page.id;boundState=state();
    fields.replaceChildren();
    const nodes = layout
      ? new DOMParser()
          .parseFromString(layout.html, 'text/html')
          .querySelectorAll<HTMLElement>('[data-notale-placeholder]')
      : [];
    for (const node of nodes) {
      const id = node.dataset.notalePlaceholder!,
        label = document.createElement('label'),
        input = document.createElement('textarea');
      label.textContent = node.dataset.notaleLabel || id;
      input.dataset.key = id;
      input.rows = 3;
      input.value = page.layoutValues?.[layout!.id]?.[id] ?? node.textContent ?? '';
      input.dataset.baseline = input.value;
      label.append(input);
      fields.append(label);
    }
    const imageNodes = layout
      ? new DOMParser()
          .parseFromString(layout.html, 'text/html')
          .querySelectorAll<HTMLElement>('[data-notale-image-placeholder]')
      : [];
    for (const node of imageNodes) {
      const id = node.dataset.notaleImagePlaceholder!,
        label = document.createElement('label'),
        file = document.createElement('input'),
        reset = document.createElement('button');
      label.textContent =
        (node.dataset.notaleLabel || id) +
        ' · ' +
        (page.layoutImages?.[layout!.id]?.[id] ? '本页图片' : '母版图片');
      file.type = 'file';
      file.accept = 'image/*';
      file.dataset.imageKey = id;
      file.onchange = () => {
        const picked = file.files?.[0];
        if (!picked) return;
        const documentId = context.document().id,
          slideId = page.id,
          layoutId = layout!.id;
        panel.disabled = true;
        void context
          .uploadImage(picked)
          .then(async (upload) => {
            if (context.document().id !== documentId || context.slide().id !== slideId)
              throw new Error('页面已切换，请重新选择图片');
            await context.commands([
              { type: 'asset.put', ...upload },
              {
                type: 'layout.image',
                slideId,
                id: layoutId,
                key: id,
                image: { path: upload.path, alt: picked.name },
              },
            ]);
          })
          .catch(context.error)
          .finally(() => {
            panel.disabled = false;
            render();
          });
      };
      reset.textContent = '恢复母版图片';
      reset.dataset.resetImage = id;
      reset.disabled = !page.layoutImages?.[layout!.id]?.[id];
      reset.onclick = () => {
        panel.disabled = true;
        void context
          .commands([
            { type: 'layout.image', slideId: page.id, id: layout!.id, key: id, image: null },
          ])
          .catch(context.error)
          .finally(() => {
            panel.disabled = false;
            render();
          });
      };
      label.append(file, reset);
      fields.append(label);
    }
    for (const id of ['save-layout-values', 'reset-layout-values'])
      panel.querySelector<HTMLButtonElement>('#' + id)!.disabled = !nodes.length;
    panel.hidden = !page.layoutSourceId && !nodes.length && !imageNodes.length;
  }
  const inputs = () => [...fields.querySelectorAll<HTMLTextAreaElement>('textarea')];
  run('save-layout-values', async () => {
    const changes = inputs().filter((input) => input.value !== input.dataset.baseline);
    if (!changes.length) return;
    validate();
    await context.commands([
      {
        type: 'layout.values',
        slideId: context.slide().id,
        id: context.slide().layoutId!,
        values: Object.fromEntries(changes.map((input) => [input.dataset.key!, input.value])),
      },
    ]);
    changes.forEach(input=>input.dataset.baseline=input.value);key='';
  });
  run('reset-layout-values', async () => {validate();await context.commands([
      {
        type: 'layout.values',
        slideId: context.slide().id,
        id: context.slide().layoutId!,
        values: Object.fromEntries(inputs().map((input) => [input.dataset.key!, null])),
      },
    ]);inputs().forEach(i=>i.dataset.baseline=i.value);key='';});
  run('set-layout-placeholder', async () => {
    const target = context.selected()[0];
    if (!target || !context.slide().layoutSourceId)
      throw new Error('请在母版编辑页选中一个文字对象');
    const node = new DOMParser()
      .parseFromString(context.slide().html, 'text/html')
      .querySelector(`[data-notale-id="${CSS.escape(target)}"]`);
    const image = node?.tagName === 'IMG';
    await context.commands([
      {
        type: 'element.patch',
        slideId: context.slide().id,
        target,
        patch: {
          attributes: {
            [image ? 'data-notale-image-placeholder' : 'data-notale-placeholder']:
              panel.querySelector<HTMLInputElement>('#placeholder-key')!.value,
            'data-notale-label': panel.querySelector<HTMLInputElement>('#placeholder-label')!.value,
          },
        },
      },
    ]);
  });
  return { render,reset(){key='';boundPage='';render();} };
}
