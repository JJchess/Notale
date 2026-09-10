/** Small monochrome controls matching the rest of the editor's SVG icon family. */
export function installDockIcons() {
  const paths: Record<string,string> = {
    undo:'<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v2"/>',
    redo:'<path d="m16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7v2"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
    up:'<path d="m6 10 6-6 6 6M12 4v16"/>',
    down:'<path d="m6 14 6 6 6-6M12 4v16"/>',
    left:'<path d="m14 5-7 7 7 7"/>',
    right:'<path d="m10 5 7 7-7 7"/>',
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    align:'<path d="M4 3v18M8 6h12v4H8ZM8 14h8v4H8Z"/>',
    distribute:'<path d="M3 3v18M21 3v18M8 7h8v10H8Z"/>',
    zoomIn:'<path d="M5 12h14M12 5v14"/>',
    zoomOut:'<path d="M5 12h14"/>',
    pencil:'<path d="m15 3 6 6-12 12H3v-6ZM13 5l6 6"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    notes:'<path d="M4 3h16v14H9l-5 4ZM8 7h8M8 11h8"/>',
    plus:'<circle cx="12" cy="12" r="9"/><path d="M7 12h10M12 7v10"/>',
  };
  const svg=(name:string)=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  for (const [selector,name] of [['.mode-pencil','pencil'],['.mode-eye','eye'],['#dock-delete-page','trash'],['#toggle-notes','notes']] as const)
    document.querySelectorAll(selector).forEach(el=>el.innerHTML=svg(name));
  const controls = [
    ['undo','undo','撤销','Ctrl/⌘ + Z'], ['redo','redo','重做','Ctrl/⌘ + Shift + Z'],
    ['copy-slide','copy','复制页面',''], ['delete-slide','trash','删除页面',''],
    ['up-slide','up','页面上移',''], ['down-slide','down','页面下移',''],
    ['add-slide','plus','添加页面',''], ['dock-add-page','plus','添加页面',''],
    ['overview','overview','页面总览',''], ['align-left','align','左对齐',''],
    ['distribute','distribute','水平等距分布',''],
    ['zoom-in','zoomIn','放大画布',''], ['zoom-out','zoomOut','缩小画布',''],
    ['dock-previous-page','left','上一页',''], ['dock-next-page','right','下一页',''],
    ['preview-previous','left','上一步或上一页',''], ['preview-next','right','下一步或下一页',''],
  ];
  for (const [id,icon,label,shortcut] of controls) {
    const button = document.getElementById(id)!;
    button.innerHTML = svg(icon);
    button.classList.add('icon-button');
    button.setAttribute('aria-label',label);
    button.title = label + (shortcut ? ` · ${shortcut}` : '');
  }
}
