// 几何只依赖本次输入节点的顺序；搜索期间不移动节点。
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

window.renderNotaleView = packet => {
  const s = packet.state || {}, nodes = s.nodes || [];
  const dist = s.dist || {}, parent = s.parent || {}, queue = s.queue || [];
  const ended = s.stage === 'done' || s.stage === 'path';
  const processed = new Set(s.processed || []), path = s.path || [];
  const pos = new Map(nodes.map((n, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / nodes.length;
    return [n, [320 + 205 * Math.cos(angle), 212 + 152 * Math.sin(angle)]];
  }));
  const edges = s.edges || [];
  const edgeKeys = new Set(edges.map(([a, b]) => JSON.stringify([a, b])));
  let svg = '<defs><marker id="bfs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="context-stroke"/></marker></defs>';
  edges.forEach(([a, b], i) => {
    const [x, y] = pos.get(a), [u, v] = pos.get(b);
    const dx = u - x, dy = v - y, length = Math.hypot(dx, dy) || 1;
    const nx = dx / length, ny = dy / length;
    const bend = edgeKeys.has(JSON.stringify([b, a])) ? 35 : 0;
    const d = a === b ? `M${x-18},${y-18} C${x-60},${y-80} ${x+60},${y-80} ${x+18},${y-18}`
      : `M${x+nx*25},${y+ny*25} Q${(x+u)/2-ny*bend},${(y+v)/2+nx*bend} ${u-nx*29},${v-ny*29}`;
    const onPath = path.some((n, j) => n === a && path[j+1] === b);
    const fresh = s.newly === b && parent[b] === a;
    svg += `<path id="edge-${i}" d="${d}" fill="none" stroke="var(${onPath || fresh ? '--code-accent' : '--code-line'})" stroke-width="${onPath || fresh ? 3.5 : 1.5}" marker-end="url(#bfs-arrow)"/>`;
  });
  nodes.forEach((n, i) => {
    const [x, y] = pos.get(n), known = Object.hasOwn(dist, n);
    const current = s.current === n, fresh = s.newly === n;
    const label = known ? `d=${dist[n]}` : ended ? '不可达' : '未发现';
    const ink = current ? '--code-bg' : '--code-ink';
    svg += `<g id="node-${i}"><circle cx="${x}" cy="${y}" r="24" fill="var(${current ? '--code-accent' : '--code-bg'})" stroke="var(${known ? '--code-accent' : '--code-line'})" stroke-width="${processed.has(n) ? 3 : 1.5}" stroke-dasharray="${known ? 'none' : '4 4'}"/>`;
    if (fresh) svg += `<circle cx="${x}" cy="${y}" r="31" fill="none" stroke="var(--code-secondary)" stroke-width="2"/>`;
    svg += `<text x="${x}" y="${y+5}" text-anchor="middle" fill="var(${ink})" font-size="16">${esc(n)}</text><text x="${x}" y="${y+43}" text-anchor="middle" fill="var(--code-muted)" font-size="12">${esc(label)}</text></g>`;
  });
  svg += '<text x="35" y="440" fill="var(--code-muted)" font-size="13">队首 →</text>';
  const cell = Math.min(58, 485 / Math.max(1, queue.length));
  queue.forEach((n, i) => {
    const x = 112 + i * cell;
    svg += `<g id="queue-${nodes.indexOf(n)}"><line x1="${x-cell*.35}" y1="449" x2="${x+cell*.35}" y2="449" stroke="var(--code-line)"/><text x="${x}" y="440" text-anchor="middle" fill="var(--code-ink)" font-size="15">${esc(n)}</text></g>`;
  });
  if (!queue.length) svg += '<text x="112" y="440" fill="var(--code-muted)" font-size="13">空</text>';
  let status = '初始化';
  if (s.stage === 'initial') status = `起点 ${s.start} 入队，距离为 0`;
  if (s.stage === 'dequeue') status = `${s.current} 出队，检查它的邻居`;
  if (s.stage === 'discover') status = `发现 ${s.newly}：距离 ${dist[s.newly]}，前驱 ${parent[s.newly]}，加入队尾`;
  if (s.stage === 'done') status = `搜索完成 · 出队顺序 ${(s.order || []).join(' → ')}`;
  if (s.stage === 'path') status = path.length ? `${path.join(' → ')} · ${dist[s.target]} 条边` : `${s.start} 无法到达 ${s.target}`;
  document.getElementById('code-title').textContent = 'BFS · 每次向外推进一层';
  document.getElementById('code-status').textContent = status;
  document.getElementById('code-caption').textContent = '实心：当前节点　粗描边：已处理　外圈：刚入队';
  patchSvg(document.getElementById('code-plot'), `<svg viewBox="0 0 640 470" role="img" aria-label="BFS 图与执行队列">${svg}</svg>`, {animate: true});
};
