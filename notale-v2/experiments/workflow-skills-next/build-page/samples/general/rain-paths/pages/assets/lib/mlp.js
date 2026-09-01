/* ============================================================================
   mlp.js — 一个能在页面上实时训练、随时读出内部状态的小型多层感知机。

   来历:从一次生成里长出来的实现,原样保留了它的数值处理,只把页面耦合剥掉、
   输入维度放开。之所以留着而不是换成 TensorFlow.js:实测同一个网络
   (2→10→10→1、200 个点、每帧 12 个 mini-batch、80×80 决策边界每 8 帧重算),

       tf.js 4.22   每帧 102.7 ms   热力场一次 124 ms
       本文件        每帧   0.79 ms   热力场一次 4.4 ms

   收敛结果一样(准确率 0.975 vs 0.95,决策边界平均绝对差 0.03)。这个量级的
   浮点量微不足道,框架的 per-op 开销和 GPU 回读才是大头。要加载预训练模型或者
   在真图片上跑卷积,那还是得用 tf.js —— 那些本文件做不到。

   ── 能做什么 ────────────────────────────────────────────────────────────
   任意层数、任意输入维度、单个 sigmoid 输出的二分类,损失是交叉熵。
   **不做**多分类(没有 softmax)、不做回归、不做卷积、不做动量/Adam。
   要那些就别硬改这个文件,它的价值在于小而透明。

   ── 用法 ────────────────────────────────────────────────────────────────
     var net = MLP.create({ sizes:[2,10,10,1], act:'tanh', lr:0.3 });

     // 每帧推进若干个 mini-batch —— 逐帧控制权是这个文件存在的理由
     for (var i = 0; i < 12; i++) net.step(trainSet, 16);
     if (net.diverged) { … }                     // 权重跑飞了,step() 自动停手

     net.predict(x)                              // x 是长度 = sizes[0] 的数组
     net.evaluate(valSet)                        // {loss, acc}
     net.layers[1].a                             // 第 2 层的激活值,直接给可视化用
     net.reset()                                 // 重新初始化,数据不动

   样本格式:`{ x:[…], t:0|1 }`。t 是标签,x 长度要等于 sizes[0]。

   ── 数值上几处不是随手写的 ──────────────────────────────────────────────
   · sigmoid 按 z 的正负分支,大负数时不会 exp 溢出
   · ReLU 用 He、tanh/sigmoid 用 Xavier 初始化 —— 既不为 0 也不过大
   · 交叉熵把概率裁到 [1e-7, 1-1e-7],否则 log(0) 是 −∞,一个点就毁掉整条曲线
   · 激活导数同时接收 z 和 a,tanh 用 1−a² 、sigmoid 用 a(1−a),不重算前向
   · 更新权重时同时查 isFinite 和幅值上界 —— 只查 isFinite 抓不到「训练毁了」:
     sigmoid 饱和后 (a−t) 上界是 1,梯度永远变不成 Inf,权重能一路涨到 1e6 而
     全程 isFinite。判定用 net.diverged,阈值 cfg.wmax(默认 1e4)
   ========================================================================== */
(function (global) {
  'use strict';

  function sigmoid(z) {
    if (z >= 0) return 1 / (1 + Math.exp(-z));
    var e = Math.exp(z);
    return e / (1 + e);
  }

  var ACT = {
    tanh:    { f: function (z) { return Math.tanh(z); }, df: function (z, a) { return 1 - a * a; } },
    relu:    { f: function (z) { return z > 0 ? z : 0; }, df: function (z, a) { return z > 0 ? 1 : 0; } },
    sigmoid: { f: sigmoid,                                df: function (z, a) { return a * (1 - a); } }
  };

  /* 可选种子:同一个种子每次跑出同一个网络。教学页面需要「重来一次还是这样」。 */
  function rng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  function MLPNet(cfg) {
    this.sizes = cfg.sizes;
    this.act = cfg.act || 'tanh';
    this.lr = cfg.lr === undefined ? 0.3 : cfg.lr;
    this.seed = cfg.seed;
    // 权重超过这个幅值就判定训练已经毁了。正常收敛的网络 |w| 很少过 100。
    this.wmax = cfg.wmax === undefined ? 1e4 : cfg.wmax;
    if (!ACT[this.act]) throw new Error('mlp: 未知激活 ' + this.act + ',只有 tanh/relu/sigmoid');
    if (!this.sizes || this.sizes.length < 2) throw new Error('mlp: sizes 至少要两层');
    if (this.sizes[this.sizes.length - 1] !== 1) throw new Error('mlp: 输出层只支持 1 个单元(二分类)');
    this.reset();
  }

  MLPNet.prototype.reset = function () {
    var rand = rng(this.seed), sz = this.sizes, L = [];
    function randn() {
      var u = 0, v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    for (var l = 1; l < sz.length; l++) {
      var nin = sz[l - 1], nout = sz[l], last = (l === sz.length - 1);
      // ReLU 每层砍掉一半的信号,所以要 √(2/nin) 补回来;tanh/sigmoid 用 √(1/nin)
      var gain = (!last && this.act === 'relu') ? Math.sqrt(2 / nin) : Math.sqrt(1 / nin);
      var W = new Float64Array(nout * nin);
      for (var i = 0; i < W.length; i++) W[i] = randn() * gain;
      L.push({
        nin: nin, nout: nout, last: last,
        W: W, b: new Float64Array(nout),
        z: new Float64Array(nout), a: new Float64Array(nout),
        gW: new Float64Array(nout * nin), gb: new Float64Array(nout),
        d: new Float64Array(nout)
      });
    }
    this.layers = L;
    this.inBuf = new Float64Array(sz[0]);
    this.iter = 0;
    this.diverged = false;
    this._cursor = 0;
    this._order = null;
    return this;
  };

  /* 前向。每层的 z 和 a 都留在 layer 上 —— 可视化要读激活值,不必再跑一遍。 */
  MLPNet.prototype.predict = function (x) {
    var buf = this.inBuf, L = this.layers, A = ACT[this.act], i;
    for (i = 0; i < buf.length; i++) buf[i] = x[i];
    var inp = buf;
    for (var l = 0; l < L.length; l++) {
      var ly = L[l], W = ly.W, nin = ly.nin, nout = ly.nout;
      for (var j = 0; j < nout; j++) {
        var s = ly.b[j], base = j * nin;
        for (var k = 0; k < nin; k++) s += W[base + k] * inp[k];
        ly.z[j] = s;
        ly.a[j] = ly.last ? sigmoid(s) : A.f(s);
      }
      inp = ly.a;
    }
    return L[L.length - 1].a[0];
  };

  /* 反向。梯度累加进 gW/gb,不立刻更新 —— mini-batch 要先攒够再走一步。 */
  MLPNet.prototype._backward = function (t, scale) {
    var L = this.layers, A = ACT[this.act], nl = L.length;
    L[nl - 1].d[0] = (L[nl - 1].a[0] - t) * scale;   // sigmoid + 交叉熵,导数正好这么简单
    for (var l = nl - 1; l >= 0; l--) {
      var ly = L[l], prev = l > 0 ? L[l - 1].a : this.inBuf;
      for (var j = 0; j < ly.nout; j++) {
        var dj = ly.d[j], base = j * ly.nin;
        ly.gb[j] += dj;
        for (var k = 0; k < ly.nin; k++) ly.gW[base + k] += dj * prev[k];
      }
      if (l > 0) {
        var pl = L[l - 1];
        for (var k2 = 0; k2 < ly.nin; k2++) {
          var s = 0;
          for (var j2 = 0; j2 < ly.nout; j2++) s += ly.W[j2 * ly.nin + k2] * ly.d[j2];
          pl.d[k2] = s * A.df(pl.z[k2], pl.a[k2]);
        }
      }
    }
  };

  /* w ← w − η·∂L/∂w,顺手查权重有没有崩。

     只查 isFinite 是不够的:sigmoid 输出会饱和到 0/1,(a−t) 的上界就是 1,所以
     梯度永远变不成 Inf。实测 lr=800 跑 300 步,|w| 涨到 4.96e6、准确率掉回 0.5、
     损失 8.06,而 isFinite 一路为真。所以再加一条权重幅值的闸。 */
  MLPNet.prototype._apply = function () {
    var bad = false, L = this.layers, lr = this.lr, cap = this.wmax, i, v;
    for (var l = 0; l < L.length; l++) {
      var ly = L[l];
      for (i = 0; i < ly.W.length; i++) {
        v = ly.W[i] -= lr * ly.gW[i];
        if (!isFinite(v) || v > cap || v < -cap) bad = true;
      }
      for (i = 0; i < ly.b.length; i++) {
        v = ly.b[i] -= lr * ly.gb[i];
        if (!isFinite(v) || v > cap || v < -cap) bad = true;
      }
      ly.gW.fill(0); ly.gb.fill(0);
    }
    return bad;
  };

  /* 推进一个 mini-batch。样本按 epoch 洗牌后顺序取,取完一轮重洗 —— 每帧调几次
     由页面决定,这就是「实时训练」的控制权所在。 */
  MLPNet.prototype.step = function (data, batch) {
    if (!data || !data.length || this.diverged) return this;
    batch = batch || 16;
    if (!this._order || this._order.length !== data.length) {
      this._order = new Int32Array(data.length);
      for (var q = 0; q < data.length; q++) this._order[q] = q;
      this._cursor = 0;
    }
    if (this._cursor === 0) {
      var rand = Math.random, o = this._order;      // 洗牌用真随机,不吃 seed:
      for (var i = o.length - 1; i > 0; i--) {      // 否则每个 epoch 的顺序完全一样
        var j = (rand() * (i + 1)) | 0, tmp = o[i]; o[i] = o[j]; o[j] = tmp;
      }
    }
    var scale = 1 / batch, n = data.length;
    for (var s = 0; s < batch; s++) {
      var p = data[this._order[(this._cursor + s) % n]];
      this.predict(p.x);
      this._backward(p.t, scale);
    }
    this._cursor = (this._cursor + batch) % n;
    if (this._apply()) this.diverged = true;
    this.iter++;
    return this;
  };

  /* 交叉熵 + 准确率。概率裁到 [1e-7, 1-1e-7],否则一个 log(0) 毁掉整条损失曲线。 */
  MLPNet.prototype.evaluate = function (data) {
    var loss = 0, ok = 0, n = data.length || 1;
    for (var i = 0; i < data.length; i++) {
      var p = data[i], yh = this.predict(p.x);
      if (!isFinite(yh)) return { loss: NaN, acc: 0 };
      var q = Math.min(1 - 1e-7, Math.max(1e-7, yh));
      loss += -(p.t * Math.log(q) + (1 - p.t) * Math.log(1 - q));
      if ((yh >= 0.5 ? 1 : 0) === p.t) ok++;
    }
    return { loss: loss / n, acc: ok / n };
  };

  /* 每层的平均激活强度,给「神经元亮度」这类可视化用。 */
  MLPNet.prototype.activationLevels = function () {
    return this.layers.map(function (ly) {
      var s = 0;
      for (var i = 0; i < ly.a.length; i++) s += Math.abs(ly.a[i]);
      return s / ly.a.length;
    });
  };

  /* 在一个矩形区域上批量求值,直接得到决策边界热力场。
     返回长度 nx*ny 的 Float64Array,行优先,y 从 lo 到 hi。 */
  MLPNet.prototype.field = function (x0, y0, x1, y1, nx, ny, out) {
    out = out || new Float64Array(nx * ny);
    var p = [0, 0], k = 0;
    for (var j = 0; j < ny; j++) {
      p[1] = y0 + (y1 - y0) * (ny === 1 ? 0 : j / (ny - 1));
      for (var i = 0; i < nx; i++) {
        p[0] = x0 + (x1 - x0) * (nx === 1 ? 0 : i / (nx - 1));
        out[k++] = this.predict(p);
      }
    }
    return out;
  };

  var MLP = {
    create: function (cfg) { return new MLPNet(cfg || {}); },
    sigmoid: sigmoid,
    ACT: ACT
  };

  if (typeof module === 'object' && module.exports) module.exports = MLP;
  else global.MLP = MLP;
})(typeof self !== 'undefined' ? self : this);
