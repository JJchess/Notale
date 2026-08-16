/* ============================================================================
   参考,不是底盘。不要在任何页面里 <script src> 它。

   这是第一轮实验(nn-01)那份 deck.js 里**生成外观**的部分,原先被我放进了
   base.js。移出来的原因:它做的三件事全是那次主题的视觉设计,不是机制 ——

     buildBar     顶栏(左边小标+章节名、右边页码+年份)
     buildRail    底部导航轨道:一条横线 + 每页一个节点 + 悬停气泡 + 范围标注
     buildCable   跨页接线:从上一页边缘穿过本页节点再流向下一页的贝塞尔曲线
     accentStops  按页码在两个 RGB 之间插值 --accent(用来表现「年代由冷转暖」)

   这四样都很好,但它们是「一个有时间线的主题」的表达。换成讲一个算法、
   一次实验、一组概念对比,导航该长什么样、要不要接线、强调色该不该随页
   渐变,答案完全不同。冻进底盘就等于替下一个主题做了设计决定。

   留着的用处:如果新主题确实也是时间线叙事,可以照抄手法(不是照抄数值)。
   注意里面有两处写死的白色 rgba(255,255,255,…),那是假设了深色背景 ——
   这也正是它不该在冻结层里的证据之一。
   ========================================================================== */

function buildBar(stage, cfg, n) {
  var pages = cfg.pages, page = pages[n - 1] || {};
  var bar = document.createElement('header');
  bar.className = 'bar';
  bar.innerHTML =
    '<div class="bar__left">' +
      '<span class="bar__mark">' + (cfg.mark || '') + '</span>' +
      '<span class="bar__sep"></span>' +
      '<span class="bar__sec">' + (page.section || '') + '</span>' +
    '</div>' +
    '<div class="bar__right">' +
      '<span class="bar__num">' + pad(n) + ' / ' + pages.length + '</span>' +
      '<span class="bar__year">' + (page.label || '') + '</span>' +
    '</div>';
  stage.insertBefore(bar, stage.firstChild);
}

function buildRail(stage, cfg, n) {
  var pages = cfg.pages;
  var X0 = 118, X1 = 1482, Y = 38;
  function nodeX(i) { return X0 + (X1 - X0) * (i / Math.max(1, pages.length - 1)); }

  var rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', '翻页导航');

  var html = '<svg class="rail__wire" viewBox="0 0 1600 84" preserveAspectRatio="none">' +
    '<line x1="' + X0 + '" y1="' + Y + '" x2="' + X1 + '" y2="' + Y +
    '" stroke="rgba(255,255,255,.12)" stroke-width="1"/></svg>';

  (cfg.spans || []).forEach(function (s) {
    var a = nodeX(s[0] - 1), b = nodeX(s[1] - 1);
    html += '<div class="rail__span" style="left:' + a + 'px;width:' + (b - a) + 'px">' +
            '<span>' + s[2] + '</span></div>';
  });

  html += '<div class="rail__nodes">';
  pages.forEach(function (p, i) {
    html += '<a class="rail__node' + (p.n === n ? ' is-now' : '') + '" href="' + href(p.n) +
      '" style="left:' + nodeX(i) + 'px" aria-label="' + (p.label || '') + ' ' + (p.name || '') + '">' +
      '<span class="rail__dot"></span>' +
      '<span class="rail__tip">' + (p.label || '') + ' · ' + (p.name || '') + '</span>' +
      '<span class="rail__yr">' + (p.label || '') + '</span></a>';
  });
  html += '</div>';
  html += '<a class="rail__arrow rail__arrow--prev' + (n === 1 ? ' is-off' : '') + '" href="' +
          href(Math.max(1, n - 1)) + '" aria-label="上一页">←</a>';
  html += '<a class="rail__arrow rail__arrow--next' + (n === pages.length ? ' is-off' : '') + '" href="' +
          href(Math.min(pages.length, n + 1)) + '" aria-label="下一页">→</a>';
  rail.innerHTML = html;
  stage.appendChild(rail);
  return nodeX;
}

/* 跨页接线:让相邻页面的边缘曲线首尾对上,翻页时视觉上像一根连续的线。
   edgeY 长度必须是 pages.length + 1(每一页左右各一个接点)。 */
function buildCable(stage, cfg, n, nodeX) {
  var nx = nodeX(n - 1), ny = 816 + 38;
  var yIn = cfg.edgeY[n - 1], yOut = cfg.edgeY[n];
  var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#888';
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'cable');
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.style.cssText = 'position:absolute;inset:0;z-index:-1;pointer-events:none';
  svg.innerHTML =
    '<path d="M-20 ' + yIn + ' C ' + (nx * 0.5) + ' ' + yIn + ', ' + (nx * 0.8) + ' ' + ny +
    ', ' + nx + ' ' + ny + '" fill="none" stroke="' + accent + '" stroke-width="1.2" opacity=".22"/>' +
    '<path d="M' + nx + ' ' + ny + ' C ' + (nx + (1600 - nx) * 0.3) + ' ' + ny + ', ' +
    (1600 - (1600 - nx) * 0.18) + ' ' + yOut + ', 1620 ' + yOut +
    '" fill="none" stroke="' + accent + '" stroke-width="1.2" opacity=".22"/>';
  stage.insertBefore(svg, stage.firstChild);
}

/* 按页码在若干 RGB 停靠点之间插值,写回 --accent。
   nn-01 用它做「1943 冷蓝 → 2020s 暖橙」的年代感。 */
function applyAccentStops(n, total, stops) {
  var t = (n - 1) / Math.max(1, total - 1), rgb = stops[stops.length - 1][1], i;
  for (i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) {
      var a = stops[i], b = stops[i + 1];
      var k = (t - a[0]) / (b[0] - a[0] || 1);
      rgb = [0, 1, 2].map(function (j) { return Math.round(a[1][j] + (b[1][j] - a[1][j]) * k); });
      break;
    }
  }
  var root = document.documentElement;
  root.style.setProperty('--accent', '#' + rgb.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''));
  root.style.setProperty('--accent-dim', 'rgba(' + rgb.join(',') + ',.16)');
  return rgb;
}

function pad(n) { return ('0' + n).slice(-2); }
function href(n) { return 'page-' + pad(n) + '.html'; }
