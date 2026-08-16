(function (global) {
  'use strict';

  // ============================================================
  // Lec.K —— 常量表:神经网络发展史所需的一切数值来源
  // ============================================================
  var K = {

    TOTAL_PAGES: 20,

    // ---------- 数学 / 激活函数相关常量 ----------
    MATH: {
      E: Math.E
    },

    ACTIVATION_PARAMS: {
      SIGMOID_MAX_DERIVATIVE: 0.25,   // sigmoid 导数最大值,发生在 x=0
      TANH_MAX_DERIVATIVE: 1,         // tanh 导数最大值
      RELU_DERIVATIVE_POS: 1,
      RELU_DERIVATIVE_NEG: 0
    },

    // ---------- 感知机收敛定理相关的示例常量 ----------
    PERCEPTRON_DEMO: {
      R: 1.0,      // 样本到原点的最大距离(示例值)
      GAMMA: 0.2   // 几何间隔(示例值)
    },

    // ---------- 时间线:关键里程碑 ----------
    TIMELINE: [
      { year: 1943, event: 'McCulloch–Pitts 神经元模型', tag: 'model',    detail: '首次用逻辑阈值单元形式化神经元' },
      { year: 1949, event: 'Hebb 提出突触学习规则',        tag: 'learning', detail: '"一起激活的神经元连接增强"' },
      { year: 1958, event: 'Rosenblatt 发明感知机',        tag: 'model',    detail: 'Mark I Perceptron,400 光电管输入' },
      { year: 1960, event: 'Widrow–Hoff 提出 ADALINE / 델타规则', tag: 'learning', detail: '最小均方(LMS)学习' },
      { year: 1969, event: 'Minsky & Papert 出版《Perceptrons》', tag: 'critique', detail: '证明单层感知机无法解决 XOR' },
      { year: 1974, event: 'Werbos 博士论文提出反向传播思想',    tag: 'algorithm', detail: '未被广泛注意' },
      { year: 1980, event: 'Fukushima 提出 Neocognitron',       tag: 'model', detail: '卷积神经网络的先驱' },
      { year: 1982, event: 'Hopfield 网络提出',                  tag: 'model', detail: '基于能量函数的联想记忆' },
      { year: 1986, event: 'Rumelhart、Hinton、Williams 推广反向传播', tag: 'algorithm', detail: '使多层网络训练成为可能' },
      { year: 1989, event: 'LeCun 将 CNN 用于手写数字识别',      tag: 'model', detail: 'LeNet 系列的起点' },
      { year: 1997, event: 'Hochreiter & Schmidhuber 提出 LSTM', tag: 'model', detail: '解决长期依赖与梯度消失' },
      { year: 1998, event: 'LeNet-5 发布',                        tag: 'model', detail: '用于 MNIST 手写数字识别' },
      { year: 2006, event: 'Hinton 提出深度信念网络,"深度学习"概念兴起', tag: 'rebrand', detail: '逐层预训练突破深层网络训练难题' },
      { year: 2009, event: 'ImageNet 数据集发布',                 tag: 'dataset', detail: '李飞飞团队,大规模标注图像数据' },
      { year: 2011, event: 'ReLU 激活函数被广泛采用',             tag: 'algorithm', detail: '缓解梯度消失问题' },
      { year: 2012, event: 'AlexNet 在 ImageNet 竞赛夺冠',        tag: 'model', detail: 'GPU 训练深度 CNN 的突破点' },
      { year: 2014, event: 'GAN、VGG、GoogLeNet 相继提出',        tag: 'model', detail: '网络深度与生成模型齐头并进' },
      { year: 2015, event: 'ResNet 提出残差连接',                 tag: 'model', detail: '训练出 152 层的深度网络' },
      { year: 2017, event: 'Transformer 架构提出',                tag: 'model', detail: '《Attention Is All You Need》' },
      { year: 2018, event: 'BERT 发布',                            tag: 'model', detail: '预训练语言模型范式确立' },
      { year: 2020, event: 'GPT-3 发布',                           tag: 'model', detail: '1750 亿参数规模' }
    ],

    // ---------- AI 寒冬 ----------
    AI_WINTERS: [
      { start: 1974, end: 1980, name: '第一次 AI 寒冬', cause: 'Minsky & Papert 对感知机的批评 + 算力/数据不足' },
      { start: 1987, end: 1993, name: '第二次 AI 寒冬', cause: '专家系统衰落 + 神经网络热度回落' }
    ],

    // ---------- 关键模型规格 ----------
    MODELS: [
      { name: 'Perceptron (Mark I)', year: 1958, params: 400,        layers: 1,   dataset: 'N/A',      top5Error: null,  note: '20x20 光电管输入,单层' },
      { name: 'LeNet-5',             year: 1998, params: 60000,      layers: 7,   dataset: 'MNIST',    top5Error: null,  top1Error: 0.95 },
      { name: 'AlexNet',             year: 2012, params: 60000000,   layers: 8,   dataset: 'ImageNet', top5Error: 15.3 },
      { name: 'VGG-16',              year: 2014, params: 138000000,  layers: 16,  dataset: 'ImageNet', top5Error: 7.3 },
      { name: 'GoogLeNet',           year: 2014, params: 5000000,    layers: 22,  dataset: 'ImageNet', top5Error: 6.7 },
      { name: 'ResNet-152',          year: 2015, params: 60000000,   layers: 152, dataset: 'ImageNet', top5Error: 3.57 },
      { name: 'Transformer-base',    year: 2017, params: 65000000,   layers: 12,  dataset: 'WMT',      top5Error: null },
      { name: 'BERT-base',           year: 2018, params: 110000000,  layers: 12,  dataset: 'Wiki+Books', top5Error: null },
      { name: 'GPT-2',               year: 2019, params: 1500000000, layers: 48,  dataset: 'WebText',  top5Error: null },
      { name: 'GPT-3',               year: 2020, params: 175000000000, layers: 96, dataset: 'CommonCrawl等', top5Error: null }
    ],

    // ---------- 数据集规模 ----------
    DATASETS: {
      MNIST:    { train: 60000,   test: 10000,  imageSize: 28,  channels: 1, classes: 10 },
      CIFAR10:  { train: 50000,   test: 10000,  imageSize: 32,  channels: 3, classes: 10 },
      IMAGENET: { train: 1200000, val: 50000,   imageSize: 224, channels: 3, classes: 1000 }
    },

    // ---------- 算力增长参考 ----------
    COMPUTE: {
      MOORE_DOUBLING_MONTHS: 24,     // 经典摩尔定律:晶体管数量约 18-24 个月翻倍
      AI_ERA_DOUBLING_MONTHS: 3.4    // 2012-2018 AI 训练算力翻倍周期(OpenAI 统计口径)
    },

    // ---------- 视觉一致性(图表用) ----------
    COLORS: {
      PRIMARY:   '#2b6cb0',
      SECONDARY: '#c05621',
      MUTED:     '#718096',
      BG:        '#f7fafc',
      LINE:      '#e2e8f0',
      GOOD:      '#2f855a',
      BAD:       '#c53030'
    }
  };

  // ============================================================
  // Lec.P —— 算法与公式:页面只调用,不写死数字
  // ============================================================
  var P = {

    // ---------------- 激活函数及其导数 ----------------
    sigmoid: function (x) {
      return 1 / (1 + Math.pow(K.MATH.E, -x));
    },
    sigmoidDerivative: function (x) {
      var s = P.sigmoid(x);
      return s * (1 - s);
    },
    tanh: function (x) {
      return Math.tanh ? Math.tanh(x) :
        (Math.pow(K.MATH.E, x) - Math.pow(K.MATH.E, -x)) / (Math.pow(K.MATH.E, x) + Math.pow(K.MATH.E, -x));
    },
    tanhDerivative: function (x) {
      var t = P.tanh(x);
      return 1 - t * t;
    },
    relu: function (x) {
      return x > 0 ? x : 0;
    },
    reluDerivative: function (x) {
      return x > 0 ? K.ACTIVATION_PARAMS.RELU_DERIVATIVE_POS : K.ACTIVATION_PARAMS.RELU_DERIVATIVE_NEG;
    },
    step: function (x, threshold) {
      threshold = threshold || 0;
      return x >= threshold ? 1 : 0;
    },

    // ---------------- McCulloch–Pitts 神经元 ----------------
    // inputs, weights: 等长数组; threshold: 阈值
    mcpNeuron: function (inputs, weights, threshold) {
      var sum = 0, i;
      for (i = 0; i < inputs.length; i++) {
        sum += inputs[i] * weights[i];
      }
      return P.step(sum, threshold);
    },

    // ---------------- Hebbian 学习规则 ----------------
    // deltaW = lr * xi * xj
    hebbianUpdate: function (xi, xj, lr) {
      return lr * xi * xj;
    },

    // ---------------- 感知机 ----------------
    perceptronNetInput: function (weights, bias, inputs) {
      var sum = bias, i;
      for (i = 0; i < inputs.length; i++) {
        sum += weights[i] * inputs[i];
      }
      return sum;
    },
    perceptronPredict: function (weights, bias, inputs) {
      return P.step(P.perceptronNetInput(weights, bias, inputs), 0) === 1 ? 1 : -1;
    },
    // 感知机学习规则:w_i += lr*(y - yhat)*x_i ; b += lr*(y - yhat)
    perceptronUpdate: function (weights, bias, inputs, y, yhat, lr) {
      var newWeights = weights.slice(), i;
      var err = y - yhat;
      for (i = 0; i < inputs.length; i++) {
        newWeights[i] = weights[i] + lr * err * inputs[i];
      }
      return { weights: newWeights, bias: bias + lr * err };
    },
    // Novikoff 感知机收敛定理:最大更新次数上界 = (R/gamma)^2
    perceptronMistakeBound: function (R, gamma) {
      R = (R === undefined) ? K.PERCEPTRON_DEMO.R : R;
      gamma = (gamma === undefined) ? K.PERCEPTRON_DEMO.GAMMA : gamma;
      return Math.pow(R / gamma, 2);
    },

    // ---------------- XOR / 线性可分性 ----------------
    xorTable: function () {
      return [
        { x1: 0, x2: 0, y: 0 },
        { x1: 0, x2: 1, y: 1 },
        { x1: 1, x2: 0, y: 1 },
        { x1: 1, x2: 1, y: 0 }
      ];
    },
    andTable: function () {
      return [
        { x1: 0, x2: 0, y: 0 },
        { x1: 0, x2: 1, y: 0 },
        { x1: 1, x2: 0, y: 0 },
        { x1: 1, x2: 1, y: 1 }
      ];
    },
    orTable: function () {
      return [
        { x1: 0, x2: 0, y: 0 },
        { x1: 0, x2: 1, y: 1 },
        { x1: 1, x2: 0, y: 1 },
        { x1: 1, x2: 1, y: 1 }
      ];
    },
    // 判断一条直线 w1*x1+w2*x2+b=0 是否将给定表正确线性分类
    isLinearlySeparableBy: function (table, w1, w2, b) {
      var i, row, pred;
      for (i = 0; i < table.length; i++) {
        row = table[i];
        pred = (w1 * row.x1 + w2 * row.x2 + b) >= 0 ? 1 : 0;
        if (pred !== row.y) { return false; }
      }
      return true;
    },

    // ---------------- Hopfield 网络能量函数 ----------------
    // E = -1/2 * sum_i sum_j w_ij*s_i*s_j - sum_i b_i*s_i
    hopfieldEnergy: function (weights, states, biases) {
      var n = states.length, i, j, e = 0;
      for (i = 0; i < n; i++) {
        for (j = 0; j < n; j++) {
          if (i !== j) {
            e += weights[i][j] * states[i] * states[j];
          }
        }
      }
      e = -0.5 * e;
      if (biases) {
        for (i = 0; i < n; i++) { e -= biases[i] * states[i]; }
      }
      return e;
    },

    // ---------------- 梯度下降 / 反向传播 ----------------
    gradientDescentStep: function (w, grad, lr) {
      return w - lr * grad;
    },
    // 链式法则:多层导数相乘
    chainRuleProduct: function (derivatives) {
      var i, p = 1;
      for (i = 0; i < derivatives.length; i++) { p *= derivatives[i]; }
      return p;
    },
    // 梯度消失演示:每层导数上限的 depth 次幂
    vanishingGradientDecay: function (depth, perLayerMaxDerivative) {
      perLayerMaxDerivative = (perLayerMaxDerivative === undefined) ?
        K.ACTIVATION_PARAMS.SIGMOID_MAX_DERIVATIVE : perLayerMaxDerivative;
      return Math.pow(perLayerMaxDerivative, depth);
    },

    // ---------------- 卷积 / 参数量计算 ----------------
    convOutputSize: function (inputSize, kernelSize, stride, padding) {
      stride = stride || 1;
      padding = padding || 0;
      return Math.floor((inputSize - kernelSize + 2 * padding) / stride) + 1;
    },
    convParamCount: function (kernelSize, inChannels, outChannels, useBias) {
      var w = kernelSize * kernelSize * inChannels * outChannels;
      return w + (useBias ? outChannels : 0);
    },
    fcParamCount: function (inSize, outSize, useBias) {
      var w = inSize * outSize;
      return w + (useBias === false ? 0 : outSize);
    },
    // 给定各层大小数组的全连接网络总参数量
    mlpParamCount: function (layerSizes, useBias) {
      var total = 0, i;
      for (i = 0; i < layerSizes.length - 1; i++) {
        total += P.fcParamCount(layerSizes[i], layerSizes[i + 1], useBias);
      }
      return total;
    },

    // ---------------- 时间线 / 历史检索 ----------------
    filterTimeline: function (startYear, endYear) {
      var out = [], i, e;
      for (i = 0; i < K.TIMELINE.length; i++) {
        e = K.TIMELINE[i];
        if (e.year >= startYear && e.year <= endYear) { out.push(e); }
      }
      return out;
    },
    nearestMilestone: function (year) {
      var best = null, bestDist = Infinity, i, e, d;
      for (i = 0; i < K.TIMELINE.length; i++) {
        e = K.TIMELINE[i];
        d = Math.abs(e.year - year);
        if (d < bestDist) { bestDist = d; best = e; }
      }
      return best;
    },
    isInWinter: function (year) {
      var i, w;
      for (i = 0; i < K.AI_WINTERS.length; i++) {
        w = K.AI_WINTERS[i];
        if (year >= w.start && year <= w.end) { return w; }
      }
      return null;
    },
    yearsBetween: function (y1, y2) {
      return y2 - y1;
    },

    // ---------------- 模型对比 ----------------
    modelByName: function (name) {
      var i;
      for (i = 0; i < K.MODELS.length; i++) {
        if (K.MODELS[i].name === name) { return K.MODELS[i]; }
      }
      return null;
    },
    paramGrowthRatio: function (nameA, nameB) {
      var a = P.modelByName(nameA), b = P.modelByName(nameB);
      if (!a || !b) { return null; }
      return b.params / a.params;
    },
    errorRateImprovement: function (startErr, endErr) {
      if (!startErr) { return null; }
      return (startErr - endErr) / startErr * 100;
    },

    // ---------------- 算力增长(摩尔定律 / AI 时代) ----------------
    // value = start * 2^(months/doublingMonths)
    computeGrowth: function (startValue, months, doublingMonths) {
      return startValue * Math.pow(2, months / doublingMonths);
    },
    monthsBetween: function (y1, y2) {
      return (y2 - y1) * 12;
    },

    // ---------------- 通用数值工具 ----------------
    linearInterpolate: function (x0, y0, x1, y1, x) {
      if (x1 === x0) { return y0; }
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    },

    // ---------------- 格式化(全套统一显示口径) ----------------
    formatNumber: function (n) {
      var abs = Math.abs(n);
      if (abs >= 1e9) { return (n / 1e9).toFixed(abs >= 1e11 ? 0 : 1) + 'B'; }
      if (abs >= 1e6) { return (n / 1e6).toFixed(abs >= 1e8 ? 0 : 1) + 'M'; }
      if (abs >= 1e3) { return (n / 1e3).toFixed(abs >= 1e5 ? 0 : 1) + 'K'; }
      return String(n);
    },
    formatPercent: function (x, decimals) {
      decimals = (decimals === undefined) ? 2 : decimals;
      return x.toFixed(decimals) + '%';
    },
    formatYear: function (y) {
      return String(y);
    }
  };

  // ============================================================
  // Lec.mount —— 页眉页脚统一挂载
  // ============================================================
  function pad2(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  function mount(cfg) {
    cfg = cfg || {};
    var index = cfg.index || 1;
    var total = K.TOTAL_PAGES;
    var kicker = cfg.kicker || '';
    var title = cfg.title || '';
    var take = cfg.take || '';

    // ---------- 页眉 ----------
    var header = document.getElementById('lec-header');
    if (!header) {
      header = document.createElement('header');
      header.id = 'lec-header';
      if (document.body.firstChild) {
        document.body.insertBefore(header, document.body.firstChild);
      } else {
        document.body.appendChild(header);
      }
    }
    var pct = Math.round((index / total) * 100);
    header.innerHTML =
      '<div class="lec-progress-track" style="height:4px;background:' + K.COLORS.LINE + ';">' +
        '<div class="lec-progress-bar" style="height:4px;width:' + pct + '%;background:' + K.COLORS.PRIMARY + ';"></div>' +
      '</div>' +
      '<div class="lec-head-inner">' +
        '<div class="lec-kicker" style="color:' + K.COLORS.MUTED + ';">' + kicker +
          '<span class="lec-page-no"> · ' + index + ' / ' + total + '</span></div>' +
        '<h1 class="lec-title">' + title + '</h1>' +
      '</div>';

    if (title) {
      document.title = title + (kicker ? ' - ' + kicker : '');
    }

    // ---------- 页脚 ----------
    var footer = document.getElementById('lec-footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.id = 'lec-footer';
      document.body.appendChild(footer);
    }

    var prevHref = cfg.prevHref;
    var nextHref = cfg.nextHref;
    if (prevHref === undefined && index > 1) {
      prevHref = 'page-' + pad2(index - 1) + '.html';
    }
    if (nextHref === undefined && index < total) {
      nextHref = 'page-' + pad2(index + 1) + '.html';
    }

    var navHtml = '<div class="lec-nav">';
    navHtml += prevHref ?
      '<a class="lec-prev" href="' + prevHref + '">&larr; 上一页</a>' :
      '<span class="lec-prev lec-disabled">&larr; 上一页</span>';
    navHtml += '<span class="lec-nav-mid">' + index + ' / ' + total + '</span>';
    navHtml += nextHref ?
      '<a class="lec-next" href="' + nextHref + '">下一页 &rarr;</a>' :
      '<span class="lec-next lec-disabled">下一页 &rarr;</span>';
    navHtml += '</div>';

    footer.innerHTML =
      (take ? '<div class="lec-take" style="border-left:3px solid ' + K.COLORS.PRIMARY + ';">' + take + '</div>' : '') +
      navHtml;

    return { header: header, footer: footer };
  }

  // ============================================================
  // 导出
  // ============================================================
  global.Lec = {
    K: K,
    P: P,
    mount: mount
  };

})(typeof window !== 'undefined' ? window : this);