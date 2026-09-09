/* ============================================================================
   base.js — 冻结层。所有 topic 共用同一份,任何一次生成都不改它。

   收录标准和 base.css 一样:**换一个主题也绝不会想改的东西**。
   所以这里没有任何 DOM 外观生成 —— 顶栏、导航轨道、跨页接线、按页码插值
   强调色,这些都属于「某一次主题的视觉设计」,已经移走了。只剩机制。

   ── API ────────────────────────────────────────────────────────────────
     Deck.W / Deck.H          逻辑画布尺寸(读自 CSS 的 --stage-w/--stage-h)
     Deck.s                   当前缩放比(同 :root 上的 --s)
     Deck.init(cfg)           可选;只做键盘翻页和 document.title,不生成任何外观
     Deck.onResize(fn)        注册尺寸变化回调,返回注销函数

     Deck.fit(cv)             canvas 高分屏适配,返回已 setTransform 的 2d ctx
     Deck.autofit(cv, draw)   fit + 首次绘制 + 缩放变化时自动重新 fit 并重绘
     Deck.pt(el, e)           指针事件 → 逻辑坐标 {x,y}(缩放/触摸/触摸结束都兼容)

     Deck.token(name)         读 CSS 自定义属性的原始字符串
     Deck.rgb(name)           读成 [r,g,b]  —— canvas 里写不了 var(),必须先读出来
     Deck.rgba(name, a)       读成 'rgba(r,g,b,a)'

     Deck.reduced()           系统是否要求减少动态
     Deck.loop(fn[,opt])      requestAnimationFrame 循环,返回 stop()
                              · reduced-motion 下不进循环,只画一帧 fn(opt.still||0, 0)
                                起始帧没信息的动画,用 opt.still 指定该定格在哪一刻
                              · 标签页隐藏时自动暂停,回来时不会有 dt 跳变
     Deck.clamp / Deck.lerp / Deck.fmt
     Deck.rr(ctx,x,y,w,h,r)   圆角矩形路径(有原生 roundRect 就用原生)
     Deck.arrow(ctx,x1,y1,x2,y2,size)   带箭头的线段

   ── 使用契约 ────────────────────────────────────────────────────────────
   页面里只要有 #stage,引入本文件就已经开始工作(缩放监听在末尾自动装好)。
   Deck.init() 是可选的,只在需要键盘翻页时调用:

     Deck.init({ index:3, total:14 });                 // ← 通常只需要这一行
     Deck.init({ index:3, total:14, keys:false });     // 不要键盘翻页
     Deck.init({ index:3, total:14, href:function(n){ return 'p'+n+'.html'; } });

   页面之间的叙事(阶段、时间线、进度指示)属于每次生成的设计,自己写,
   底盘不会替你画。
   ========================================================================== */
(function (global) {
  'use strict';

  var Deck = {
    W: 1600,
    H: 900,
    s: 1,

    /* ---------------------------------------------------------------------
       缩放:把逻辑画布等比放到视口里。--s 同时写回 :root,供 CSS 使用。
       --------------------------------------------------------------------- */
    resize: function () {
      var cs = getComputedStyle(document.documentElement);
      var w = parseFloat(cs.getPropertyValue('--stage-w')) || 1600;
      var h = parseFloat(cs.getPropertyValue('--stage-h')) || 900;
      Deck.W = w; Deck.H = h;

      var s = Math.min(window.innerWidth / w, window.innerHeight / h);
      if (!isFinite(s) || s <= 0) s = 1;
      Deck.s = s;
      document.documentElement.style.setProperty('--s', s);

      for (var i = 0; i < _resizeFns.length; i++) {
        try { _resizeFns[i](s); } catch (e) { /* 一个回调出错不该拖垮其它的 */ }
      }
    },

    onResize: function (fn) {
      _resizeFns.push(fn);
      return function () {
        var i = _resizeFns.indexOf(fn);
        if (i >= 0) _resizeFns.splice(i, 1);
      };
    },

    init: function (cfg) {
      cfg = cfg || {};
      var n = cfg.index || 1, total = cfg.total || 1;
      var href = typeof cfg.href === 'function' ? cfg.href : function (i) {
        return 'page-' + ('0' + i).slice(-2) + '.html';
      };

      if (cfg.title) document.title = cfg.title;

      // 键盘只登记翻页配置;真正的按键处理在文件末尾那一个监听里 ——
      // 「下一步」先出元素、出完才翻页,两件事必须是同一个动作,所以只能有一个处理函数。
      if (cfg.keys !== false && total > 1) Deck._nav = { n: n, total: total, href: href };

      Deck.resize();
      return Deck;
    },

    /* ---------------------------------------------------------------------
       canvas 高分屏适配。

       注意这里的 ratio 不是单纯的 devicePixelRatio:舞台被 scale(--s) 整体
       缩放过,一个 800 逻辑 px 宽的 canvas 最终占屏 800·s·dpr 个物理像素。
       所以真正需要的采样率是 dpr·s,只按 dpr 算会在 s>1 的大屏上发虚。
       上限压到 2 —— 再高的密度肉眼收益极小,像素数却是平方增长。
       --------------------------------------------------------------------- */
    ratio: function () {
      var r = (window.devicePixelRatio || 1) * (Deck.s || 1);
      return Math.max(1, Math.min(2, r));
    },

    fit: function (cv) {
      var w = cv.offsetWidth, h = cv.offsetHeight;
      if (!w || !h) return null;          // 还没布局或被 display:none,画了也是白画
      var r = Deck.ratio();
      cv.width = Math.max(1, Math.round(w * r));
      cv.height = Math.max(1, Math.round(h * r));
      var ctx = cv.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(r, 0, 0, r, 0, 0);
      cv.__w = w; cv.__h = h; cv.__r = r;  // 逻辑尺寸:画图一律按这两个数,不要用 cv.width
      return ctx;
    },

    /* fit 之后把绘制也接管掉:缩放比变化时自动重新 fit 并重绘。
       改变 canvas 的 width/height 会清空内容并重置变换矩阵,所以「重新 fit」
       必然伴随「重绘」,这两件事绑在一起才不会漏。 */
    autofit: function (cv, draw) {
      function run() {
        var ctx = Deck.fit(cv);
        if (ctx) draw(ctx, cv.__w, cv.__h);
      }
      run();
      var off = Deck.onResize(function () {
        if (Math.abs((cv.__r || 0) - Deck.ratio()) > 0.01) run();
      });
      return { redraw: run, stop: off };
    },

    /* ---------------------------------------------------------------------
       指针事件 → 逻辑坐标。

       舞台被 transform:scale 缩放后,e.clientX 是屏幕坐标,和页面里写的
       1600×900 不是同一套数字。getBoundingClientRect() 返回的是缩放**后**的
       尺寸,offsetWidth 返回的是缩放**前**的布局尺寸,两者相除就是这一层
       实际的缩放比 —— 这样写对嵌套 transform 也成立,不必依赖全局 --s。
       --------------------------------------------------------------------- */
    pt: function (el, e) {
      var r = el.getBoundingClientRect();
      var s = (el.offsetWidth ? r.width / el.offsetWidth : Deck.s) || 1;
      // touchend 时 e.touches 是空的,手指位置只在 changedTouches 里
      var t = (e.touches && e.touches[0]) ||
              (e.changedTouches && e.changedTouches[0]) || e;
      return { x: (t.clientX - r.left) / s, y: (t.clientY - r.top) / s };
    },

    /* ---------------------------------------------------------------------
       读 CSS token。canvas 的 fillStyle 不认 var(--x),必须先读出真值。
       用浏览器绘制后读回 sRGB 像素,不假定 fillStyle 序列化一定是 hex/rgb。
       完全透明或无效颜色返回黑色；rgba() 的 alpha 由调用者提供。
       --------------------------------------------------------------------- */
    token: function (name) {
      var k = name.charAt(0) === '-' ? name : '--' + name;
      return getComputedStyle(document.documentElement).getPropertyValue(k).trim();
    },

    rgb: function (name) {
      var v = Deck.token(name);
      if (!v) return [0, 0, 0];
      if (!_probe) {
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        _probe = canvas.getContext('2d', {willReadFrequently: true});
      }
      _probe.clearRect(0, 0, 1, 1);
      _probe.fillStyle = '#000';
      _probe.fillStyle = v;
      _probe.fillRect(0, 0, 1, 1);
      return Array.from(_probe.getImageData(0, 0, 1, 1).data).slice(0, 3);
    },

    rgba: function (name, a) {
      return 'rgba(' + Deck.rgb(name).join(',') + ',' + a + ')';
    },

    /* ---------------------------------------------------------------------
       动画
       --------------------------------------------------------------------- */
    /* ---------------------------------------------------------------------
       分步出场。**公开表面只有三样**:
         元素上写 data-deck-step="2"      —— 第 2 步才出现(1 起数;第 0 步是页面刚打开)
         Deck.onStep(fn, n)          —— canvas/svg 里画的东西按 fn(step, max) 重绘;n 声明这个 fn 需要几步
         下一步 = 先出元素,出完才翻页 —— 右方向键 / PageDown;左键对称回退
       其余是实现:根上一个 --step 变量,元素上一个 --at,可见性由 base.css 用 calc 算,
       未出场的元素加 inert(透明的东西不能还能点)。?all 或 reduced-motion 直接停在末步,
       学生课后复看走这条;上一页回来时落在它的末步(#last)。
       没写 data-deck-step 的页面 stepMax=0,next() 直接翻页,与以前完全一样。
       --------------------------------------------------------------------- */
    step: 0,
    stepMax: 0,
    _stepFns: [],
    _need: 0,           // onStep 声明的步数;纯 JS 驱动的页没有 data-deck-step 元素,stepMax 从这里来
    _nav: null,
    onStep: function (fn, n) {
      Deck._stepFns.push(fn);
      if ((n | 0) > Deck._need) { Deck._need = n | 0; if (Deck._need > Deck.stepMax) Deck.stepMax = Deck._need; }
      fn(Deck.step, Deck.stepMax);
      return function () {
        var i = Deck._stepFns.indexOf(fn);
        if (i >= 0) Deck._stepFns.splice(i, 1);
      };
    },
    stepTo: function (i) {
      i = Math.max(0, Math.min(Deck.stepMax, i | 0));
      Deck.step = i;
      document.documentElement.style.setProperty('--step', i);
      var els = document.querySelectorAll('#stage [data-deck-step]');
      for (var k = 0; k < els.length; k++) {
        var at = parseInt(els[k].getAttribute('data-deck-step'), 10) || 0;
        if (at > i) els[k].setAttribute('inert', ''); else els[k].removeAttribute('inert');
      }
      for (var j = 0; j < Deck._stepFns.length; j++) Deck._stepFns[j](i, Deck.stepMax);
      return i;
    },
    next: function () {
      if (Deck.step < Deck.stepMax) { Deck.stepTo(Deck.step + 1); return true; }
      return false;
    },
    prev: function () {
      if (Deck.step > 0) { Deck.stepTo(Deck.step - 1); return true; }
      return false;
    },
    rescan: function () {
      var els = document.querySelectorAll('#stage [data-deck-step]'), max = 0;
      for (var k = 0; k < els.length; k++) {
        var at = parseInt(els[k].getAttribute('data-deck-step'), 10) || 0;
        if (at > 0) { els[k].style.setProperty('--at', at); if (at > max) max = at; }
      }
      Deck.stepMax = Math.max(max, Deck._need);
      return Deck.stepMax;
    },

    reduced: function () {
      return !!(window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    },

    /* fn(t, dt):t 是循环开始以来的毫秒数,dt 是距上一帧的毫秒数。
       · reduced-motion 下不进循环,只调一次 fn(still, 0) 画一张静态图。
         still 默认 0,也就是**起始帧**。但很多动画的起始帧是没有信息的
         (网络还没训练、球还没滚下去、粒子还没铺开),那样降级等于交白卷。
         这种情况把有意义的那一刻的时间戳传进来:
             Deck.loop(draw, { still: 3000 })   // 静态图画 t=3000ms 那一帧
       · 标签页切走时暂停,切回来 dt 从 0 重新算,避免一次巨大的位移跳变 */
    loop: function (fn, opt) {
      if (Deck.reduced()) { fn((opt && opt.still) || 0, 0); return function () {}; }
      var id = 0, t0 = 0, last = 0, dead = false;

      function tick(now) {
        if (dead) return;
        if (!t0) { t0 = now; last = now; }
        var dt = now - last; last = now;
        fn(now - t0, dt);
        id = requestAnimationFrame(tick);
      }
      function onVis() {
        if (dead) return;
        if (document.hidden) { cancelAnimationFrame(id); id = 0; }
        else if (!id) { last = 0; t0 = 0; id = requestAnimationFrame(tick); }
      }
      document.addEventListener('visibilitychange', onVis);
      id = requestAnimationFrame(tick);

      return function () {
        dead = true;
        cancelAnimationFrame(id);
        document.removeEventListener('visibilitychange', onVis);
      };
    },

    /* ---------------------------------------------------------------------
       几何与数值:纯计算,和主题无关
       --------------------------------------------------------------------- */
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp: function (a, b, t) { return a + (b - a) * t; },

    fmt: function (v, d) {
      d = d === undefined ? 2 : d;
      return (v >= 0 ? '+' : '') + v.toFixed(d);
    },

    rr: function (ctx, x, y, w, h, r) {
      r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    arrow: function (ctx, x1, y1, x2, y2, size) {
      size = size || 6;
      var a = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - size * Math.cos(a - 0.4), y2 - size * Math.sin(a - 0.4));
      ctx.lineTo(x2 - size * Math.cos(a + 0.4), y2 - size * Math.sin(a + 0.4));
      ctx.closePath(); ctx.fill();
    }
  };

  var _resizeFns = [];
  var _probe = null;

  window.addEventListener('resize', Deck.resize);
  window.addEventListener('orientationchange', Deck.resize);
  Deck.resize();

  // 分步:扫一遍 data-deck-step,决定起始步。不依赖 Deck.init —— 实测两套里 7 页没调它。
  function bootSteps() {
    Deck.rescan();
    var all = Deck.reduced() || /[?&]all\b/.test(location.search);
    var last = location.hash === '#last';
    if (all || last) document.documentElement.setAttribute('data-steps', 'all');   // 不要开场动画
    Deck.stepTo(all || last ? Deck.stepMax : 0);
    if (last && !all) setTimeout(function () {
      document.documentElement.removeAttribute('data-steps');                       // 之后回退仍有过渡
    }, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSteps);
  else bootSteps();

  // 唯一的按键处理:先步进,步进不了才翻页。
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = (e.target && e.target.tagName) || '';
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
    if (e.target && e.target.isContentEditable) return;
    var fwd = e.key === 'ArrowRight' || e.key === 'PageDown';
    var back = e.key === 'ArrowLeft' || e.key === 'PageUp';
    if (!fwd && !back) return;
    if (fwd ? Deck.next() : Deck.prev()) { e.preventDefault(); return; }
    var nav = Deck._nav;
    if (!nav) return;
    var q = location.search;                       // ?all 要跟着翻页走,否则复看模式翻一页就丢
    if (fwd && nav.n < nav.total) {
      var to = nav.href(nav.n + 1);
      location.href = to + (to.indexOf('?') < 0 ? q : '');
    } else if (back && nav.n > 1) {
      var back_to = nav.href(nav.n - 1);
      location.href = back_to + (back_to.indexOf('?') < 0 ? q : '') + '#last';
    }
  });

  global.Deck = Deck;
})(window);
