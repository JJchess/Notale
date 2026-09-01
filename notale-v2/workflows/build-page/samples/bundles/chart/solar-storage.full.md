<sample id="solar-storage" category="chart" variant="full">
  <file path="samples/chart/solar-storage/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>太阳落山后，电从哪里来？</title>
  <link rel="stylesheet" href="assets/base.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main id="stage" data-beat="overview" aria-labelledby="pageTitle">
    <header class="masthead">
      <div class="min0">
        <h1 id="pageTitle">太阳落山后，电从哪里来？</h1>
        <p class="dek">看同一条时间轴：光伏最强时，用电还没到峰值；真正的挑战是把“早到的电”留到更晚。</p>
      </div>
    </header>

    <section class="composition" aria-label="光伏供给与用电需求的全天对比">
      <figure class="chart-figure min0" aria-labelledby="chartQuestion" aria-describedby="figureCaption">
        <div class="figure-head">
          <p class="reader-question" id="chartQuestion"><strong>两座峰为什么没有相遇？</strong> 比较每个时刻的光伏供给与用电需求。</p>
          <div class="legend" aria-label="图例">
            <span class="legend-item solar"><i class="legend-line" aria-hidden="true"></i>光伏供给</span>
            <span class="legend-item demand"><i class="legend-line" aria-hidden="true"></i>用电需求</span>
          </div>
        </div>

        <div class="plot-wrap min0" id="plotWrap">
          <div class="daylight-strip" aria-hidden="true"></div>
          <svg class="graphic-layer" id="bandOverlay" aria-hidden="true" focusable="false">
            <polygon class="surplus-shape" id="surplusShape"></polygon>
            <polygon class="gap-shape" id="gapShape"></polygon>
          </svg>
          <div id="chart" role="img" aria-label="从零点到二十四点的折线图。光伏在十四点达到八十八吉瓦，用电需求在二十点达到七十八吉瓦，两座峰相差六小时。"></div>
          <svg class="graphic-layer" id="routeOverlay" aria-hidden="true" focusable="false">
            <defs>
              <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 9 5 L 0 10 z" fill="#ffd35c"></path>
              </marker>
            </defs>
            <path id="noonGuide" class="guide-line"></path>
            <path id="eveningGuide" class="guide-line"></path>
            <path id="noonBracket" class="measure-bracket noon-bracket"></path>
            <path id="eveningBracket" class="measure-bracket evening-bracket"></path>
            <path id="transferBase" class="transfer-base" marker-end="url(#arrowHead)"></path>
            <path id="transferFlow" class="transfer-flow"></path>
          </svg>

          <div class="annotation" id="noonTag" aria-hidden="true">
            <strong>+24 GW</strong>
            <span>14:00 · 中午富余</span>
          </div>
          <div class="annotation" id="eveningTag" aria-hidden="true">
            <strong>−53 GW</strong>
            <span>20:00 · 傍晚缺口</span>
          </div>
          <div class="annotation" id="transferTag" aria-hidden="true">
            <strong><i class="battery-icon"></i>储能：先充，再放</strong>
            <span>搬移部分富余，不制造能量</span>
          </div>

          <div class="fallback" id="fallback" hidden>
            <strong>图表渲染器未能启动</strong>
            <p>关键证据仍然成立：14:00 光伏 88 GW、需求 64 GW，富余 24 GW；20:00 需求 78 GW、光伏 25 GW，缺口 53 GW。两座峰相差 6 小时。</p>
          </div>
        </div>

        <figcaption class="figure-note" id="figureCaption">
          <span>色带表示两条曲线之间的差值，不是第三种电源。</span>
          <span class="truth-note">储能输出 ≤ 先前存入的能量（实际还会有损耗）</span>
        </figcaption>
      </figure>

      <aside class="thesis min0" aria-label="结论与关键证据">
        <h2>储能解决时间错位，<br>不凭空增加供给。</h2>

        <div class="peak-shift" aria-label="光伏峰值与需求峰值相差六小时">
          <div class="peak solar-peak">
            <span class="time">14:00</span>
            <span class="kind">光伏峰值<br>88 GW</span>
          </div>
          <div class="shift-arrow">错开<span>6 小时</span></div>
          <div class="peak demand-peak">
            <span class="time">20:00</span>
            <span class="kind">需求峰值<br>78 GW</span>
          </div>
        </div>

        <div class="principle">
          <div class="principle-main">中午存入 <span class="arrow">→</span> 傍晚释放</div>
          <p>把早到的能量向后移动；输出受充入量、容量与效率约束。</p>
        </div>

        <p class="caution">20:00 的 53 GW 缺口大于 14:00 单点的 24 GW 富余。储能可以削减缺口，但这张图不声称它能独自补齐全部缺口。</p>

        <p id="liveStatus" aria-live="polite">中午富余与傍晚缺口同时标出。</p>

        <div class="controls" aria-label="图表讲解控制">
          <button id="replayBtn" type="button" aria-pressed="false">重演时序</button>
          <button id="resetBtn" type="button">复位</button>
        </div>
      </aside>
    </section>

    <footer class="footer">
      <p class="source"><strong>数据：</strong>教学示意数据，单位为 GW（时点功率）；未包含储能容量、效率及其他电源，不能据此计算完整调度方案。</p>
    </footer>

    <table class="sr-only">
      <caption>全天光伏供给与用电需求教学示意数据，单位吉瓦</caption>
      <thead><tr><th>时刻</th><th>用电需求</th><th>光伏供给</th></tr></thead>
      <tbody id="dataTableBody"></tbody>
    </table>
  </main>

  <script src="assets/lib/echarts.min.js"></script>
  <script src="assets/base.js"></script>
  <script src="solar-storage.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/chart/solar-storage/pages/solar-storage.js">
```javascript
(function () {
  'use strict';

  var records = [
    { id:'h00', hour:0,  demand:36, solar:0 },
    { id:'h02', hour:2,  demand:33, solar:0 },
    { id:'h04', hour:4,  demand:31, solar:0 },
    { id:'h06', hour:6,  demand:34, solar:2 },
    { id:'h08', hour:8,  demand:43, solar:22 },
    { id:'h10', hour:10, demand:55, solar:52 },
    { id:'h12', hour:12, demand:62, solar:76 },
    { id:'h14', hour:14, demand:64, solar:88 },
    { id:'h16', hour:16, demand:60, solar:81 },
    { id:'h18', hour:18, demand:63, solar:57 },
    { id:'h20', hour:20, demand:78, solar:25 },
    { id:'h22', hour:22, demand:66, solar:2 },
    { id:'h24', hour:24, demand:44, solar:0 }
  ];

  function byId(id) { return document.getElementById(id); }

  var stage = byId('stage');
  var plotWrap = byId('plotWrap');
  var chartHost = byId('chart');
  var fallback = byId('fallback');
  var replayBtn = byId('replayBtn');
  var resetBtn = byId('resetBtn');
  var liveStatus = byId('liveStatus');
  var tableBody = byId('dataTableBody');
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var chart = null;
  var resizeObserver = null;
  var offDeckResize = null;
  var resizeFrame = 0;
  var timers = [];
  var currentBeat = 'overview';
  var destroyed = false;
  var beats = ['overview', 'surplus', 'transfer', 'gap', 'settled'];

  var messages = {
    overview:'中午富余与傍晚缺口同时标出。',
    surplus:'第一段：14 点，光伏 88 吉瓦、需求 64 吉瓦，出现 24 吉瓦富余。',
    transfer:'第二段：储能先存入中午富余，再把其中一部分移到更晚。',
    gap:'第三段：20 点，需求 78 吉瓦、光伏 25 吉瓦，仍有 53 吉瓦缺口。',
    settled:'结论：储能转移能量而不制造能量，输出受先前存入量和效率限制。'
  };

  function padHour(hour) {
    return (hour < 10 ? '0' : '') + hour + ':00';
  }

  function formatGW(value) {
    return Math.round(value) + ' GW';
  }

  function difference(record) {
    return record.solar - record.demand;
  }

  function buildAccessibleTable() {
    var fragment = document.createDocumentFragment();
    records.forEach(function (record) {
      var row = document.createElement('tr');
      [padHour(record.hour), formatGW(record.demand), formatGW(record.solar)].forEach(function (value) {
        var cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    tableBody.appendChild(fragment);
  }

  function makeChartOption() {
    var reduced = reduceQuery && reduceQuery.matches;
    return {
      animation: !reduced,
      animationDuration: reduced ? 0 : 650,
      animationEasing: 'cubicOut',
      backgroundColor: 'transparent',
      textStyle: {
        color: '#d8e3de',
        fontFamily: 'PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif',
        fontSize: 16
      },
      aria: {
        enabled: true,
        description: '光伏供给和用电需求共用零到一百吉瓦的纵轴。光伏峰值在十四点，用电需求峰值在二十点，相差六小时。'
      },
      grid: { left:72, right:48, top:62, bottom:58, containLabel:false },
      tooltip: {
        trigger:'axis',
        confine:true,
        backgroundColor:'rgba(24,27,22,.97)',
        borderColor:'#51584d',
        borderWidth:1,
        padding:[12,14],
        textStyle:{ color:'#f4f0e3', fontSize:15, lineHeight:24 },
        axisPointer:{ type:'line', lineStyle:{ color:'rgba(255,255,255,.28)', width:1 } },
        formatter:function (params) {
          var index = params && params.length ? params[0].dataIndex : 0;
          var record = records[index];
          var diff = difference(record);
          var label = diff > 0 ? '富余 +' + diff : diff < 0 ? '缺口 ' + Math.abs(diff) : '平衡';
          return '<b>' + padHour(record.hour) + '</b><br>' +
            '<span style="color:#edf5ef">用电需求　' + formatGW(record.demand) + '</span><br>' +
            '<span style="color:#ffd35c">光伏供给　' + formatGW(record.solar) + '</span><br>' +
            '<span style="color:' + (diff > 0 ? '#8fc49b' : '#ff826f') + '">净差　　　' + label + ' GW</span>';
        }
      },
      xAxis: {
        type:'category',
        boundaryGap:false,
        data:records.map(function (record) { return padHour(record.hour); }),
        axisLine:{ lineStyle:{ color:'#575c51', width:1 } },
        axisTick:{ show:true, alignWithLabel:true, lineStyle:{ color:'#575c51' }, length:6 },
        axisLabel:{
          color:'#adb0a5',
          fontSize:13,
          margin:14,
          interval:0,
          formatter:function (value) { return value.slice(0,2); }
        },
        splitLine:{ show:false },
        name:'时刻',
        nameLocation:'end',
        nameGap:12,
        nameTextStyle:{ color:'#adb0a5', fontSize:13, padding:[36,0,0,-24] }
      },
      yAxis: {
        type:'value',
        min:0,
        max:100,
        interval:20,
        name:'功率（GW）',
        nameLocation:'end',
        nameGap:14,
        nameTextStyle:{ color:'#c9c9bd', fontSize:14, align:'left', padding:[0,0,0,-45] },
        axisLine:{ show:false },
        axisTick:{ show:false },
        axisLabel:{ color:'#adb0a5', fontSize:13, margin:15 },
        splitLine:{ lineStyle:{ color:'rgba(220,220,205,.14)', width:1 } }
      },
      series: [
        {
          id:'solar',
          name:'光伏供给',
          type:'line',
          data:records.map(function (record) { return record.solar; }),
          smooth:.22,
          symbol:'circle',
          symbolSize:7,
          showSymbol:true,
          z:4,
          lineStyle:{ color:'#ffd35c', width:4, shadowBlur:0 },
          itemStyle:{ color:'#ffd35c', borderColor:'#181b16', borderWidth:2 },
          emphasis:{ focus:'series', scale:1.35 },
          areaStyle:{
            opacity:1,
            color:new echarts.graphic.LinearGradient(0,0,0,1,[
              { offset:0, color:'rgba(255,211,92,.18)' },
              { offset:.7, color:'rgba(255,211,92,.035)' },
              { offset:1, color:'rgba(255,211,92,0)' }
            ])
          },
          markPoint:{
            silent:true,
            symbol:'circle',
            symbolSize:16,
            label:{ show:false },
            itemStyle:{ color:'#ffd35c', borderColor:'rgba(255,255,255,.72)', borderWidth:2 },
            data:[{ coord:[padHour(14),88] }]
          }
        },
        {
          id:'demand',
          name:'用电需求',
          type:'line',
          data:records.map(function (record) { return record.demand; }),
          smooth:.2,
          symbol:'emptyCircle',
          symbolSize:7,
          showSymbol:true,
          z:5,
          lineStyle:{ color:'#edf5ef', width:4, shadowBlur:0 },
          itemStyle:{ color:'#181b16', borderColor:'#edf5ef', borderWidth:2 },
          emphasis:{ focus:'series', scale:1.35 },
          markPoint:{
            silent:true,
            symbol:'circle',
            symbolSize:16,
            label:{ show:false },
            itemStyle:{ color:'#edf5ef', borderColor:'#ff826f', borderWidth:3 },
            data:[{ coord:[padHour(20),78] }]
          }
        }
      ]
    };
  }

  function pathPoint(x, y) {
    return x.toFixed(1) + ',' + y.toFixed(1);
  }

  function setSvgPath(id, d) {
    byId(id).setAttribute('d', d);
  }

  function crossing(first, second) {
    var firstDifference = difference(first);
    var ratio = firstDifference / (firstDifference - difference(second));
    return {
      hour:first.hour + (second.hour - first.hour) * ratio,
      value:first.demand + (second.demand - first.demand) * ratio
    };
  }

  function bandPoints(start, middle, field) {
    var points = [[start.hour, start.value]];
    middle.forEach(function (record) { points.push([record.hour, record[field]]); });
    return points;
  }

  function drawOverlay() {
    if (destroyed) return;
    var width = plotWrap.clientWidth;
    var height = plotWrap.clientHeight;
    if (!width || !height) return;

    var left = 72, right = 48, top = 62, bottom = 58;
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var x = function (hour) { return left + (hour / 24) * plotWidth; };
    var y = function (value) { return top + ((100 - value) / 100) * plotHeight; };
    var bandOverlay = byId('bandOverlay');
    var routeOverlay = byId('routeOverlay');
    [bandOverlay, routeOverlay].forEach(function (svg) {
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.setAttribute('preserveAspectRatio', 'none');
    });

    var sunrise = crossing(records[5], records[6]);
    var dusk = crossing(records[8], records[9]);
    var surplusRecords = records.slice(6,9);
    var duskPoint = [[dusk.hour, dusk.value]];
    var surplusTop = bandPoints(sunrise, surplusRecords, 'solar').concat(duskPoint);
    var surplusBottom = bandPoints(sunrise, surplusRecords, 'demand').concat(duskPoint).reverse();
    byId('surplusShape').setAttribute('points', surplusTop.concat(surplusBottom).map(function (point) {
      return pathPoint(x(point[0]), y(point[1]));
    }).join(' '));

    var gapRecords = records.slice(9);
    var gapTop = bandPoints(dusk, gapRecords, 'demand');
    var gapBottom = bandPoints(dusk, gapRecords, 'solar').reverse();
    byId('gapShape').setAttribute('points', gapTop.concat(gapBottom).map(function (point) {
      return pathPoint(x(point[0]), y(point[1]));
    }).join(' '));

    var noonX = x(14), noonSolarY = y(88), noonDemandY = y(64);
    var eveningX = x(20), eveningDemandY = y(78), eveningSolarY = y(25);
    setSvgPath('noonGuide', 'M ' + noonX + ' ' + top + ' L ' + noonX + ' ' + (height - bottom));
    setSvgPath('eveningGuide', 'M ' + eveningX + ' ' + top + ' L ' + eveningX + ' ' + (height - bottom));
    setSvgPath('noonBracket', 'M ' + (noonX - 7) + ' ' + noonSolarY + ' H ' + (noonX + 7) +
      ' M ' + noonX + ' ' + noonSolarY + ' V ' + noonDemandY +
      ' M ' + (noonX - 7) + ' ' + noonDemandY + ' H ' + (noonX + 7));
    setSvgPath('eveningBracket', 'M ' + (eveningX - 7) + ' ' + eveningDemandY + ' H ' + (eveningX + 7) +
      ' M ' + eveningX + ' ' + eveningDemandY + ' V ' + eveningSolarY +
      ' M ' + (eveningX - 7) + ' ' + eveningSolarY + ' H ' + (eveningX + 7));

    var routeStartX = noonX + 7;
    var routeStartY = noonSolarY - 7;
    var routeEndX = eveningX - 8;
    var routeEndY = eveningDemandY - 7;
    var curveY = top - 18;
    var route = 'M ' + routeStartX + ' ' + routeStartY +
      ' C ' + (routeStartX + 72) + ' ' + curveY + ', ' + (routeEndX - 72) + ' ' + curveY + ', ' + routeEndX + ' ' + routeEndY;
    setSvgPath('transferBase', route);
    setSvgPath('transferFlow', route);

    var noonTag = byId('noonTag');
    noonTag.style.left = (noonX + 18) + 'px';
    noonTag.style.top = (((noonSolarY + noonDemandY) / 2) - 31) + 'px';
    var eveningTag = byId('eveningTag');
    eveningTag.style.left = Math.min(eveningX + 18, width - 178) + 'px';
    eveningTag.style.top = (((eveningDemandY + eveningSolarY) / 2) - 31) + 'px';
    var transferTag = byId('transferTag');
    transferTag.style.left = (((noonX + eveningX) / 2) - 125) + 'px';
    transferTag.style.top = Math.max(2, top - 55) + 'px';
  }

  function scheduleResize() {
    if (destroyed) return;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      if (chart && !chart.isDisposed()) chart.resize({ animation:{ duration:0 } });
      drawOverlay();
    });
  }

  function setBeat(beat, announce) {
    currentBeat = beat;
    stage.setAttribute('data-beat', beat);
    if (announce !== false) liveStatus.textContent = messages[beat];
  }

  function clearTimers() {
    timers.forEach(function (timer) { clearTimeout(timer); });
    timers.length = 0;
  }

  function stopPlayback(label) {
    clearTimers();
    replayBtn.setAttribute('aria-pressed', 'false');
    replayBtn.textContent = label || '重演时序';
  }

  function replay() {
    stopPlayback();
    if (reduceQuery && reduceQuery.matches) {
      setBeat('settled');
      liveStatus.textContent = '储能转移能量而不制造能量；减少动态模式不播放时序。';
      replayBtn.textContent = '结论已显示';
      return;
    }
    replayBtn.setAttribute('aria-pressed', 'true');
    replayBtn.textContent = '正在重演…';
    setBeat('surplus');
    timers.push(setTimeout(function () { setBeat('transfer'); }, 1050));
    timers.push(setTimeout(function () { setBeat('gap'); }, 2250));
    timers.push(setTimeout(function () {
      setBeat('settled');
      stopPlayback('再次重演');
    }, 3450));
  }

  function reset() {
    stopPlayback();
    setBeat('overview');
    if (chart && !chart.isDisposed()) {
      chart.dispatchAction({ type:'hideTip' });
      chart.dispatchAction({ type:'downplay', seriesIndex:'all' });
    }
  }

  function step(direction) {
    stopPlayback();
    var index = beats.indexOf(currentBeat);
    if (index < 0) index = 0;
    index = Math.max(0, Math.min(beats.length - 1, index + direction));
    setBeat(beats[index]);
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var target = event.target;
    var tagName = target && target.tagName;
    if (tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(tagName)) return;
    if (target && target.isContentEditable) return;
    if (tagName === 'BUTTON' && (event.key === ' ' || event.key === 'Enter' || event.code === 'Space')) return;
    if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      replay();
    } else if (event.key === 'r' || event.key === 'R' || event.key === 'Escape') {
      event.preventDefault();
      reset();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  }

  function onMotionChange(event) {
    if (event.matches) {
      stopPlayback();
      setBeat('settled');
      if (chart && !chart.isDisposed()) chart.setOption({ animation:false });
    }
  }

  function showFallback() {
    chartHost.hidden = true;
    fallback.hidden = false;
    ['bandOverlay','routeOverlay','noonTag','eveningTag','transferTag'].forEach(function (id) {
      byId(id).hidden = true;
    });
    liveStatus.textContent = '图表渲染失败，已显示关键数值的文字版本。';
  }

  function bindEvents(method) {
    var action = method + 'EventListener';
    replayBtn[action]('click', replay);
    resetBtn[action]('click', reset);
    document[action]('keydown', onKeyDown);
    window[action]('pagehide', teardown);
    if (!reduceQuery) return;
    if (reduceQuery[action]) reduceQuery[action]('change', onMotionChange);
    else if (reduceQuery[method + 'Listener']) reduceQuery[method + 'Listener'](onMotionChange);
  }

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    stopPlayback();
    cancelAnimationFrame(resizeFrame);
    if (resizeObserver) resizeObserver.disconnect();
    if (offDeckResize) offDeckResize();
    if (chart && !chart.isDisposed()) chart.dispose();
    bindEvents('remove');
  }

  buildAccessibleTable();
  Deck.init({ title:'太阳落山后，电从哪里来？', keys:false });

  try {
    if (!window.echarts) throw new Error('ECharts unavailable');
    chart = echarts.init(chartHost, null, { renderer:'svg' });
    chart.setOption(makeChartOption(), { notMerge:true });
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(plotWrap);
    }
    offDeckResize = Deck.onResize(scheduleResize);
    scheduleResize();
  } catch (error) {
    showFallback();
  }

  bindEvents('add');
})();
```
  </file>
</sample>
