// Stable element IDs drive horizontal swaps; bar height never changes in transit.
const escapeText = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.renderNotaleView = packet => {
  const s = packet.state;
  if (!s || !Array.isArray(s.items)) return;
  const prev = new Map((packet.previousState?.items || s.items).map(item=>[item.id,item]));
  const n = s.original.length, W = 720, base = 350;
  const step = Math.min(90,620/Math.max(1,n)), left = (W-step*n)/2;
  const low = Math.min(0,...s.original), high = Math.max(0,...s.original);
  const scale = 215/Math.max(1,high-low), zero = base+low*scale;
  const label = {initial:'左侧一个元素已有序',select:'当前元素向左寻找位置',
    compare:s.will_swap?'左邻更大，交换这两个元素':'当前位置合适，本轮完成',
    swap:'交换相邻元素，当前元素向左一步',done:'排序完成'}[s.stage];
  document.getElementById('code-title').textContent = '插入排序';
  document.getElementById('code-status').textContent = n ? label || '' : '空数组无需排序';
  document.getElementById('code-caption').textContent = '相邻交换 · 柱高不变，位置互换 · 相等元素不交换';
  const draw = t => {
    let svg = `<svg viewBox="0 0 720 540" role="img" aria-label="相邻交换式插入排序" style="width:100%;height:100%;font-family:inherit">
      <path d="M${left} ${zero}H${left+step*n}" stroke="var(--code-line)"/>`;
    for(let i=0;i<n;i++) svg+=`<text x="${left+step*(i+.5)}" y="395" text-anchor="middle" font-size="13" fill="var(--code-muted)">${i}</text>`;
    // Paint the pair last, with distinct translucent fills so neither disappears at crossing.
    const items=[...s.items].sort((a,b)=>Number(s.pair.includes(a.index))-Number(s.pair.includes(b.index)));
    for(const item of items) {
      const before=prev.get(item.id) || item;
      const x=left+step*(before.index+(item.index-before.index)*t)+8, cx=x+(step-16)/2;
      const h=Math.max(2,Math.abs(item.value)*scale), y=zero-Math.max(0,item.value)*scale;
      const active=!s.settled && item.index===s.active;
      const neighbor=!s.settled && s.pair.includes(item.index) && !active;
      const color=active?'var(--code-accent)':neighbor?'var(--code-secondary)':'var(--code-ink)';
      svg+=`<g id="item-${item.id}" data-index="${item.index}">
        <rect x="${x}" y="${y}" width="${Math.max(2,step-16)}" height="${h}" fill="${color}" fill-opacity="${(active||neighbor)? .72 : .6}" stroke="${color}" stroke-width="${active||neighbor?2:0}"/>
        <text x="${cx}" y="${y-12}" text-anchor="middle" font-size="20" fill="${color}">${escapeText(item.value)}</text>`;
      if(s.original.filter(v=>v===item.value).length>1) svg+=`<text x="${cx}" y="${y+h+17}" text-anchor="middle" font-size="11" fill="var(--code-muted)">原位 ${item.id}</text>`;
      svg+='</g>';
    }
    if(s.settled && s.prefix) svg+=`<path d="M${left+8} 445v6h${step*s.prefix-16}v-6" fill="none" stroke="var(--code-secondary)"/>
      <text x="${left+step*s.prefix/2}" y="478" text-anchor="middle" font-size="14" fill="var(--code-muted)">${s.stage==='done'?'全部有序':'左侧有序前缀'}</text>`;
    patchSvg(document.getElementById('code-plot'),svg+'</svg>');
  };
  if(window.NotaleMotion?.duration && packet.previousState?.items) {
    NotaleMotion.tween(Math.min(900,1500/(packet.playback?.speed||1)*.7),t=>draw(t*t*(3-2*t)));
  } else draw(1);
};
