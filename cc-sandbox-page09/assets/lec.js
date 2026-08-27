(function (global) {
  'use strict';

  var K = {
    // 常用激活函数在 0 处的取值/斜率，便于页面直接引用做对照
    SIGMOID_AT_ZERO: 0.5,
    SIGMOID_DERIV_MAX: 0.25, // sigmoid 导数的最大值，出现在 x=0 处
    TANH_AT_ZERO: 0,
    RELU_DERIV_POS: 1,
    RELU_DERIV_NEG: 0,

    // 常见学习率参考区间（用于举例、滑块默认值等）
    LR_TYPICAL_MIN: 0.001,
    LR_TYPICAL_MAX: 0.5,
    LR_DEFAULT: 0.1,

    // 经典逻辑门数据集（AND / OR / XOR），单神经元 vs 多层对比常用
    LOGIC_INPUTS: [[0, 0], [0, 1], [1, 0], [1, 1]],
    AND_TARGETS: [0, 0, 0, 1],
    OR_TARGETS: [0, 1, 1, 1],
    XOR_TARGETS: [0, 1, 1, 0],

    // 权重初始化的经验尺度参考
    INIT_STD_XAVIER_NOTE: 'sqrt(1/n_in)',
    INIT_STD_HE_NOTE: 'sqrt(2/n_in)',

    // 梯度消失/爆炸的直观阈值参考
    GRADIENT_VANISH_THRESHOLD: 1e-4,
    GRADIENT_EXPLODE_THRESHOLD: 1e2
  };

  // ---------- 工具：数值安全 ----------
  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function dot(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  // ---------- 激活函数与导数 ----------
  function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
  }

  function sigmoidDeriv(x) {
    var s = sigmoid(x);
    return s * (1 - s);
  }

  function tanh(x) {
    return Math.tanh(x);
  }

  function tanhDeriv(x) {
    var t = Math.tanh(x);
    return 1 - t * t;
  }

  function relu(x) {
    return x > 0 ? x : 0;
  }

  function reluDeriv(x) {
    return x > 0 ? 1 : 0;
  }

  function applyActivation(name, x) {
    switch (name) {
      case 'sigmoid': return sigmoid(x);
      case 'tanh': return tanh(x);
      case 'relu': return relu(x);
      case 'linear': return x;
      default: throw new Error('unknown activation: ' + name);
    }
  }

  function applyActivationDeriv(name, x) {
    switch (name) {
      case 'sigmoid': return sigmoidDeriv(x);
      case 'tanh': return tanhDeriv(x);
      case 'relu': return reluDeriv(x);
      case 'linear': return 1;
      default: throw new Error('unknown activation: ' + name);
    }
  }

  // ---------- 单神经元前向 ----------
  // weights: [w1..wn], bias: b, inputs: [x1..xn]
  // 返回 { z, a }：z 为加权和（含偏置），a 为激活后输出
  function neuronForward(inputs, weights, bias, activation) {
    var z = dot(inputs, weights) + bias;
    var a = applyActivation(activation, z);
    return { z: z, a: a };
  }

  // ---------- 损失函数 ----------
  function mse(pred, target) {
    var s = 0;
    for (var i = 0; i < pred.length; i++) {
      var d = pred[i] - target[i];
      s += d * d;
    }
    return s / pred.length;
  }

  function mseDeriv(pred, target) {
    // d(MSE)/d(pred_i) = 2*(pred_i - target_i)/n
    var n = pred.length;
    var out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = 2 * (pred[i] - target[i]) / n;
    return out;
  }

  function binaryCrossEntropy(pred, target) {
    var eps = 1e-12;
    var s = 0;
    for (var i = 0; i < pred.length; i++) {
      var p = clamp(pred[i], eps, 1 - eps);
      s += -(target[i] * Math.log(p) + (1 - target[i]) * Math.log(1 - p));
    }
    return s / pred.length;
  }

  function binaryCrossEntropyDeriv(pred, target) {
    var eps = 1e-12;
    var n = pred.length;
    var out = new Array(n);
    for (var i = 0; i < n; i++) {
      var p = clamp(pred[i], eps, 1 - eps);
      out[i] = (-target[i] / p + (1 - target[i]) / (1 - p)) / n;
    }
    return out;
  }

  // ---------- 单神经元梯度下降（一步）----------
  // 给定单样本 (inputs, target)，当前 weights/bias/activation，
  // 计算该样本在 MSE 损失下对 weights/bias 的梯度，并返回更新后的参数。
  function neuronGradientStep(inputs, target, weights, bias, activation, lr) {
    var fwd = neuronForward(inputs, weights, bias, activation);
    var a = fwd.a, z = fwd.z;
    var dLda = 2 * (a - target); // d(MSE)/da, 单样本单输出
    var dadz = applyActivationDeriv(activation, z);
    var delta = dLda * dadz; // d(Loss)/dz

    var gradW = new Array(weights.length);
    for (var i = 0; i < weights.length; i++) gradW[i] = delta * inputs[i];
    var gradB = delta;

    var newWeights = new Array(weights.length);
    for (var j = 0; j < weights.length; j++) {
      newWeights[j] = weights[j] - lr * gradW[j];
    }
    var newBias = bias - lr * gradB;

    return {
      z: z,
      a: a,
      loss: (a - target) * (a - target),
      gradW: gradW,
      gradB: gradB,
      newWeights: newWeights,
      newBias: newBias
    };
  }

  // ---------- 两层网络（1 隐藏层）前向传播 ----------
  // layer1: { weights: [[w..],...] (每行对应一个隐藏单元), biases: [...] , activation }
  // layer2: 同结构，输出层
  // input: [x1..xn]
  function forwardTwoLayer(input, layer1, layer2) {
    var h = new Array(layer1.weights.length);
    var hz = new Array(layer1.weights.length);
    for (var i = 0; i < layer1.weights.length; i++) {
      var zi = dot(input, layer1.weights[i]) + layer1.biases[i];
      hz[i] = zi;
      h[i] = applyActivation(layer1.activation, zi);
    }

    var o = new Array(layer2.weights.length);
    var oz = new Array(layer2.weights.length);
    for (var j = 0; j < layer2.weights.length; j++) {
      var zj = dot(h, layer2.weights[j]) + layer2.biases[j];
      oz[j] = zj;
      o[j] = applyActivation(layer2.activation, zj);
    }

    return { hiddenZ: hz, hiddenA: h, outputZ: oz, outputA: o };
  }

  // ---------- 两层网络反向传播（单样本，MSE 损失）----------
  // 返回各层权重/偏置的梯度，形状与传入的 weights/biases 一致
  function backpropTwoLayer(input, target, layer1, layer2) {
    var fwd = forwardTwoLayer(input, layer1, layer2);
    var h = fwd.hiddenA, hz = fwd.hiddenZ;
    var o = fwd.outputA, oz = fwd.outputZ;

    var nOut = o.length;
    var dLdo = mseDeriv(o, target); // 长度 nOut

    // 输出层 delta
    var deltaOut = new Array(nOut);
    for (var j = 0; j < nOut; j++) {
      deltaOut[j] = dLdo[j] * applyActivationDeriv(layer2.activation, oz[j]);
    }

    // 输出层梯度
    var gradW2 = [];
    var gradB2 = new Array(nOut);
    for (var j2 = 0; j2 < nOut; j2++) {
      var row = new Array(h.length);
      for (var k = 0; k < h.length; k++) row[k] = deltaOut[j2] * h[k];
      gradW2.push(row);
      gradB2[j2] = deltaOut[j2];
    }

    // 隐藏层 delta：对每个隐藏单元，汇总来自所有输出单元的贡献
    var nHidden = h.length;
    var deltaHidden = new Array(nHidden);
    for (var i = 0; i < nHidden; i++) {
      var sum = 0;
      for (var j3 = 0; j3 < nOut; j3++) {
        sum += deltaOut[j3] * layer2.weights[j3][i];
      }
      deltaHidden[i] = sum * applyActivationDeriv(layer1.activation, hz[i]);
    }

    // 隐藏层梯度
    var gradW1 = [];
    var gradB1 = new Array(nHidden);
    for (var i2 = 0; i2 < nHidden; i2++) {
      var row1 = new Array(input.length);
      for (var m = 0; m < input.length; m++) row1[m] = deltaHidden[i2] * input[m];
      gradW1.push(row1);
      gradB1[i2] = deltaHidden[i2];
    }

    return {
      forward: fwd,
      loss: mse(o, target),
      gradW1: gradW1,
      gradB1: gradB1,
      gradW2: gradW2,
      gradB2: gradB2
    };
  }

  // ---------- 参数更新（梯度下降）----------
  // grads/params 为同形状的二维数组或一维数组，lr 为学习率
  function updateParams(params, grads, lr) {
    if (Array.isArray(params[0])) {
      var out = [];
      for (var i = 0; i < params.length; i++) {
        var row = new Array(params[i].length);
        for (var j = 0; j < params[i].length; j++) {
          row[j] = params[i][j] - lr * grads[i][j];
        }
        out.push(row);
      }
      return out;
    } else {
      var out1 = new Array(params.length);
      for (var k = 0; k < params.length; k++) {
        out1[k] = params[k] - lr * grads[k];
      }
      return out1;
    }
  }

  // ---------- 决策边界（单神经元，2 输入）----------
  // 返回直线 w1*x1 + w2*x2 + b = 0 对应的 (slope, intercept)
  // 以 x2 = slope*x1 + intercept 的形式表达，便于绘制
  function decisionBoundaryLine(w1, w2, bias) {
    if (w2 === 0) {
      return { vertical: true, x1: -bias / w1 };
    }
    return {
      vertical: false,
      slope: -w1 / w2,
      intercept: -bias / w2
    };
  }

  // ---------- 学习率对收敛的直观模拟：一维二次损失 L = a*(x - target)^2 ----------
  // 返回每一步的 x 值序列，便于画出震荡/收敛/发散的轨迹
  function gradientDescentTrace(x0, target, a, lr, steps) {
    var xs = [x0];
    var x = x0;
    for (var i = 0; i < steps; i++) {
      var grad = 2 * a * (x - target);
      x = x - lr * grad;
      xs.push(x);
    }
    return xs;
  }

  var P = {
    clamp: clamp,
    dot: dot,

    sigmoid: sigmoid,
    sigmoidDeriv: sigmoidDeriv,
    tanh: tanh,
    tanhDeriv: tanhDeriv,
    relu: relu,
    reluDeriv: reluDeriv,
    applyActivation: applyActivation,
    applyActivationDeriv: applyActivationDeriv,

    neuronForward: neuronForward,

    mse: mse,
    mseDeriv: mseDeriv,
    binaryCrossEntropy: binaryCrossEntropy,
    binaryCrossEntropyDeriv: binaryCrossEntropyDeriv,

    neuronGradientStep: neuronGradientStep,

    forwardTwoLayer: forwardTwoLayer,
    backpropTwoLayer: backpropTwoLayer,
    updateParams: updateParams,

    decisionBoundaryLine: decisionBoundaryLine,
    gradientDescentTrace: gradientDescentTrace
  };

  global.Lec = {
    K: K,
    P: P
  };

})(typeof window !== 'undefined' ? window : this);
