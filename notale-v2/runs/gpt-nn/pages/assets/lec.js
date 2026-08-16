(function (root) {
  "use strict";

  var K = {
    VERSION: "1.0.0",
    TOPIC: "神经网络的发展历史",
    PAGE_COUNT: 20,

    UI: {
      HEADER_ID: "lec-header",
      FOOTER_ID: "lec-footer",
      HEADER_CLASS: "lec-header",
      FOOTER_CLASS: "lec-footer",
      PAGE_LABEL: "页",
      PAGE_PREFIX: "第",
      PAGE_MIDDLE: "页，共",
      PROGRESS_LABEL: "讲义进度",
      DEFAULT_KICKER: "互动讲义",
      DEFAULT_TAKE: ""
    },

    MATH: {
      EPSILON: 1e-12,
      E: 2.718281828459045,
      LN2: 0.6931471805599453,
      SQRT_2: 1.4142135623730951,
      SQRT_2_OVER_PI: 0.7978845608028654,
      GELU_CUBIC: 0.044715
    },

    UNITS: {
      SECOND_PER_MINUTE: 60,
      SECOND_PER_HOUR: 3600,
      SECOND_PER_DAY: 86400,
      DAY_PER_YEAR: 365.2425,
      MILLISECOND_PER_SECOND: 1000,
      BYTE_PER_KILOBYTE: 1000,
      BYTE_PER_MEGABYTE: 1000000,
      BYTE_PER_GIGABYTE: 1000000000,
      BYTE_PER_TERABYTE: 1000000000000,
      BYTE_PER_KIBIBYTE: 1024,
      BYTE_PER_MEBIBYTE: 1048576,
      BYTE_PER_GIBIBYTE: 1073741824,
      BYTE_PER_TEBIBYTE: 1099511627776,
      BIT_PER_BYTE: 8,
      JOULE_PER_KILOWATT_HOUR: 3600000,
      WATT_PER_KILOWATT: 1000,
      THOUSAND: 1000,
      MILLION: 1000000,
      BILLION: 1000000000,
      TRILLION: 1000000000000
    },

    NUMERIC_FORMATS: {
      FP64_BYTES: 8,
      FP32_BYTES: 4,
      FP16_BYTES: 2,
      BF16_BYTES: 2,
      INT8_BYTES: 1,
      INT4_BYTES: 0.5
    },

    TRAINING: {
      FLOPS_PER_MAC: 2,
      APPROX_TRAINING_FLOPS_PER_PARAMETER_TOKEN: 6,
      SGD_STATE_MULTIPLIER: 1,
      MOMENTUM_STATE_MULTIPLIER: 2,
      ADAM_STATE_MULTIPLIER: 4,
      DEFAULT_LEARNING_RATE: 0.001,
      DEFAULT_MOMENTUM: 0.9,
      ADAM_BETA1: 0.9,
      ADAM_BETA2: 0.999,
      ADAM_EPSILON: 1e-8
    },

    ARCHITECTURE: {
      LSTM_GATES: 4,
      GRU_GATES: 3,
      TRANSFORMER_PROJECTIONS: 4,
      TRANSFORMER_LAYER_NORMS: 2,
      LAYER_NORM_VECTORS: 2
    },

    HISTORY: {
      FIRST_YEAR: 1943,
      LAST_YEAR: 2023,
      FIRST_AI_WINTER_START: 1974,
      FIRST_AI_WINTER_END: 1980,
      SECOND_AI_WINTER_START: 1987,
      SECOND_AI_WINTER_END: 1993
    },

    ERAS: [
      {
        id: "foundations",
        start: 1943,
        end: 1956,
        title: "思想与数学基础"
      },
      {
        id: "perceptron",
        start: 1957,
        end: 1969,
        title: "感知机的兴起"
      },
      {
        id: "winter",
        start: 1970,
        end: 1985,
        title: "低潮与新结构"
      },
      {
        id: "backprop",
        start: 1986,
        end: 2005,
        title: "反向传播与专用网络"
      },
      {
        id: "deep-learning",
        start: 2006,
        end: 2016,
        title: "深度学习复兴"
      },
      {
        id: "foundation-models",
        start: 2017,
        end: 2023,
        title: "Transformer 与基础模型"
      }
    ],

    TIMELINE: [
      {
        id: "mcculloch-pitts",
        year: 1943,
        title: "McCulloch–Pitts 神经元",
        people: "Warren McCulloch、Walter Pitts",
        kind: "theory",
        significance: "用逻辑与数学形式描述人工神经元。"
      },
      {
        id: "hebb",
        year: 1949,
        title: "赫布学习规则",
        people: "Donald Hebb",
        kind: "learning",
        significance: "提出连接强度随共同激活而增强的学习思想。"
      },
      {
        id: "turing",
        year: 1950,
        title: "图灵测试与学习机器设想",
        people: "Alan Turing",
        kind: "theory",
        significance: "讨论机器智能以及通过学习获得能力的可能性。"
      },
      {
        id: "perceptron",
        year: 1957,
        title: "感知机",
        people: "Frank Rosenblatt",
        kind: "model",
        significance: "把可训练权重、线性判别与硬件实验结合起来。"
      },
      {
        id: "adaline",
        year: 1960,
        title: "ADALINE",
        people: "Bernard Widrow、Marcian Hoff",
        kind: "model",
        significance: "使用连续误差和最小均方规则训练线性神经元。"
      },
      {
        id: "perceptrons-book",
        year: 1969,
        title: "《Perceptrons》",
        people: "Marvin Minsky、Seymour Papert",
        kind: "critique",
        significance: "系统分析单层感知机的表达限制。"
      },
      {
        id: "werbos-backprop",
        year: 1974,
        title: "反向传播用于神经网络",
        people: "Paul Werbos",
        kind: "learning",
        significance: "在博士论文中阐述通过反向传播训练多层网络。"
      },
      {
        id: "neocognitron",
        year: 1980,
        title: "Neocognitron",
        people: "Kunihiko Fukushima",
        kind: "model",
        significance: "以分层局部感受野和空间不变性启发后来的卷积网络。"
      },
      {
        id: "hopfield",
        year: 1982,
        title: "Hopfield 网络",
        people: "John Hopfield",
        kind: "model",
        significance: "用能量函数描述联想记忆与网络动力学。"
      },
      {
        id: "backprop",
        year: 1986,
        title: "反向传播广泛传播",
        people: "David Rumelhart、Geoffrey Hinton、Ronald Williams",
        kind: "learning",
        significance: "展示反向传播可以有效学习多层网络内部表示。"
      },
      {
        id: "cnn-zip",
        year: 1989,
        title: "卷积网络识别手写数字",
        people: "Yann LeCun 等",
        kind: "model",
        significance: "将反向传播与卷积结构用于实际字符识别。"
      },
      {
        id: "lstm",
        year: 1997,
        title: "LSTM",
        people: "Sepp Hochreiter、Jürgen Schmidhuber",
        kind: "model",
        significance: "通过门控记忆缓解循环网络中的长期依赖问题。"
      },
      {
        id: "lenet5",
        year: 1998,
        title: "LeNet-5",
        people: "Yann LeCun 等",
        kind: "model",
        significance: "形成卷积、下采样与分类器结合的经典结构。"
      },
      {
        id: "deep-belief-net",
        year: 2006,
        title: "深度置信网络",
        people: "Geoffrey Hinton、Simon Osindero、Yee-Whye Teh",
        kind: "model",
        significance: "以逐层预训练推动深层网络重新受到关注。"
      },
      {
        id: "imagenet",
        year: 2009,
        title: "ImageNet 数据集",
        people: "Fei-Fei Li、Jia Deng 等",
        kind: "dataset",
        significance: "以大规模标注图像促进视觉模型的统一评测。"
      },
      {
        id: "alexnet",
        year: 2012,
        title: "AlexNet",
        people: "Alex Krizhevsky、Ilya Sutskever、Geoffrey Hinton",
        kind: "model",
        significance: "GPU、ReLU、Dropout 与大数据共同带来视觉识别突破。"
      },
      {
        id: "gan",
        year: 2014,
        title: "生成对抗网络",
        people: "Ian Goodfellow 等",
        kind: "model",
        significance: "通过生成器与判别器的对抗训练学习生成分布。"
      },
      {
        id: "resnet",
        year: 2015,
        title: "ResNet",
        people: "Kaiming He 等",
        kind: "model",
        significance: "残差连接使极深网络更容易优化。"
      },
      {
        id: "alphago",
        year: 2016,
        title: "AlphaGo",
        people: "DeepMind",
        kind: "application",
        significance: "结合深度网络、强化学习与树搜索击败顶尖围棋棋手。"
      },
      {
        id: "transformer",
        year: 2017,
        title: "Transformer",
        people: "Ashish Vaswani 等",
        kind: "model",
        significance: "以自注意力替代循环结构，提升并行训练与长程建模能力。"
      },
      {
        id: "bert",
        year: 2018,
        title: "BERT",
        people: "Jacob Devlin 等",
        kind: "model",
        significance: "通过双向预训练推动自然语言处理的迁移学习。"
      },
      {
        id: "gpt3",
        year: 2020,
        title: "GPT-3",
        people: "OpenAI",
        kind: "model",
        significance: "展示大规模自回归模型的上下文学习与少样本能力。"
      },
      {
        id: "alphafold2",
        year: 2021,
        title: "AlphaFold 2",
        people: "DeepMind",
        kind: "application",
        significance: "深度学习显著提升蛋白质结构预测能力。"
      },
      {
        id: "chatgpt",
        year: 2022,
        title: "ChatGPT",
        people: "OpenAI",
        kind: "application",
        significance: "对话式大模型进入大规模公众使用阶段。"
      },
      {
        id: "gpt4",
        year: 2023,
        title: "多模态大模型扩展",
        people: "多家研究机构",
        kind: "model",
        significance: "文本、图像等模态进一步统一到通用模型中。"
      }
    ],

    MODELS: {
      LENET5: {
        id: "lenet5",
        name: "LeNet-5",
        year: 1998,
        parameters: 60000
      },
      ALEXNET: {
        id: "alexnet",
        name: "AlexNet",
        year: 2012,
        parameters: 60000000
      },
      VGG16: {
        id: "vgg16",
        name: "VGG-16",
        year: 2014,
        parameters: 138000000
      },
      RESNET50: {
        id: "resnet50",
        name: "ResNet-50",
        year: 2015,
        parameters: 25600000
      },
      BERT_BASE: {
        id: "bert-base",
        name: "BERT Base",
        year: 2018,
        parameters: 110000000
      },
      BERT_LARGE: {
        id: "bert-large",
        name: "BERT Large",
        year: 2018,
        parameters: 340000000
      },
      GPT2_XL: {
        id: "gpt2-xl",
        name: "GPT-2 XL",
        year: 2019,
        parameters: 1500000000
      },
      GPT3: {
        id: "gpt3",
        name: "GPT-3",
        year: 2020,
        parameters: 175000000000
      }
    },

    DATASETS: {
      MNIST: {
        id: "mnist",
        name: "MNIST",
        year: 1998,
        trainExamples: 60000,
        testExamples: 10000,
        classes: 10,
        width: 28,
        height: 28,
        channels: 1
      },
      IMAGENET: {
        id: "imagenet",
        name: "ImageNet",
        year: 2009,
        images: 14197122,
        classes: 21841
      },
      ILSVRC2012: {
        id: "ilsvrc2012",
        name: "ILSVRC 2012",
        year: 2012,
        trainExamples: 1281167,
        validationExamples: 50000,
        testExamples: 100000,
        classes: 1000
      }
    },

    BENCHMARKS: {
      ILSVRC2012_ALEXNET_TOP5_ERROR: 15.3,
      ILSVRC2012_RUNNER_UP_TOP5_ERROR: 26.2,
      ILSVRC2015_RESNET_TOP5_ERROR: 3.57,
      HUMAN_IMAGENET_TOP5_ERROR_REFERENCE: 5.1
    },

    TRANSFORMER_BASE: {
      ENCODER_LAYERS: 6,
      DECODER_LAYERS: 6,
      MODEL_DIMENSION: 512,
      FEED_FORWARD_DIMENSION: 2048,
      ATTENTION_HEADS: 8,
      HEAD_DIMENSION: 64
    }
  };

  function deepFreeze(value) {
    var key;
    if (!value || typeof value !== "object") {
      return value;
    }
    if (Object.freeze) {
      Object.freeze(value);
    }
    for (key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        deepFreeze(value[key]);
      }
    }
    return value;
  }

  deepFreeze(K);

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function toNumber(value, fallback) {
    var result = Number(value);
    return isFinite(result) ? result : fallback;
  }

  function clamp(value, minimum, maximum) {
    value = toNumber(value, minimum);
    return Math.max(minimum, Math.min(maximum, value));
  }

  function round(value, digits) {
    var places = toNumber(digits, 0);
    var factor = Math.pow(10, places);
    return Math.round(value * factor) / factor;
  }

  function safeDivide(numerator, denominator, fallback) {
    if (!isNumber(numerator) || !isNumber(denominator) || denominator === 0) {
      return typeof fallback === "undefined" ? 0 : fallback;
    }
    return numerator / denominator;
  }

  function sum(values) {
    var total = 0;
    var i;
    for (i = 0; i < values.length; i += 1) {
      total += toNumber(values[i], 0);
    }
    return total;
  }

  function mean(values) {
    return values.length ? sum(values) / values.length : 0;
  }

  function median(values) {
    var sorted;
    var middle;
    if (!values.length) {
      return 0;
    }
    sorted = values.slice().sort(function (a, b) {
      return a - b;
    });
    middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2) {
      return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function variance(values, sample) {
    var average;
    var total = 0;
    var divisor;
    var i;
    if (!values.length) {
      return 0;
    }
    average = mean(values);
    for (i = 0; i < values.length; i += 1) {
      total += Math.pow(values[i] - average, 2);
    }
    divisor = sample ? values.length - 1 : values.length;
    return divisor > 0 ? total / divisor : 0;
  }

  function standardDeviation(values, sample) {
    return Math.sqrt(variance(values, sample));
  }

  function minimum(values) {
    var result;
    var i;
    if (!values.length) {
      return 0;
    }
    result = values[0];
    for (i = 1; i < values.length; i += 1) {
      result = Math.min(result, values[i]);
    }
    return result;
  }

  function maximum(values) {
    var result;
    var i;
    if (!values.length) {
      return 0;
    }
    result = values[0];
    for (i = 1; i < values.length; i += 1) {
      result = Math.max(result, values[i]);
    }
    return result;
  }

  function normalize(values) {
    var low = minimum(values);
    var high = maximum(values);
    var range = high - low;
    var result = [];
    var i;
    for (i = 0; i < values.length; i += 1) {
      result.push(range === 0 ? 0 : (values[i] - low) / range);
    }
    return result;
  }

  function dot(left, right) {
    var length = Math.min(left.length, right.length);
    var result = 0;
    var i;
    for (i = 0; i < length; i += 1) {
      result += left[i] * right[i];
    }
    return result;
  }

  function vectorAdd(left, right) {
    var length = Math.min(left.length, right.length);
    var result = [];
    var i;
    for (i = 0; i < length; i += 1) {
      result.push(left[i] + right[i]);
    }
    return result;
  }

  function vectorSubtract(left, right) {
    var length = Math.min(left.length, right.length);
    var result = [];
    var i;
    for (i = 0; i < length; i += 1) {
      result.push(left[i] - right[i]);
    }
    return result;
  }

  function vectorScale(values, scalar) {
    var result = [];
    var i;
    for (i = 0; i < values.length; i += 1) {
      result.push(values[i] * scalar);
    }
    return result;
  }

  function vectorNorm(values) {
    return Math.sqrt(dot(values, values));
  }

  function cosineSimilarity(left, right) {
    var denominator = vectorNorm(left) * vectorNorm(right);
    return denominator === 0 ? 0 : dot(left, right) / denominator;
  }

  function transpose(matrix) {
    var result = [];
    var rows = matrix.length;
    var columns = rows ? matrix[0].length : 0;
    var row;
    var column;
    for (column = 0; column < columns; column += 1) {
      result[column] = [];
      for (row = 0; row < rows; row += 1) {
        result[column][row] = matrix[row][column];
      }
    }
    return result;
  }

  function matrixMultiply(left, right) {
    var rightT = transpose(right);
    var result = [];
    var row;
    var column;
    for (row = 0; row < left.length; row += 1) {
      result[row] = [];
      for (column = 0; column < rightT.length; column += 1) {
        result[row][column] = dot(left[row], rightT[column]);
      }
    }
    return result;
  }

  function weightedSum(inputs, weights, bias) {
    return dot(inputs, weights) + toNumber(bias, 0);
  }

  function step(value, threshold) {
    return value >= toNumber(threshold, 0) ? 1 : 0;
  }

  function sigmoid(value) {
    if (value >= 0) {
      return 1 / (1 + Math.exp(-value));
    }
    return Math.exp(value) / (1 + Math.exp(value));
  }

  function sigmoidDerivative(value, fromOutput) {
    var output = fromOutput ? value : sigmoid(value);
    return output * (1 - output);
  }

  function tanh(value) {
    var positive = Math.exp(value);
    var negative = Math.exp(-value);
    return (positive - negative) / (positive + negative);
  }

  function tanhDerivative(value, fromOutput) {
    var output = fromOutput ? value : tanh(value);
    return 1 - output * output;
  }

  function relu(value) {
    return Math.max(0, value);
  }

  function reluDerivative(value) {
    return value > 0 ? 1 : 0;
  }

  function leakyRelu(value, slope) {
    var alpha = toNumber(slope, 0.01);
    return value >= 0 ? value : alpha * value;
  }

  function elu(value, alpha) {
    var scale = toNumber(alpha, 1);
    return value >= 0 ? value : scale * (Math.exp(value) - 1);
  }

  function gelu(value) {
    var inner = K.MATH.SQRT_2_OVER_PI *
      (value + K.MATH.GELU_CUBIC * Math.pow(value, 3));
    return 0.5 * value * (1 + tanh(inner));
  }

  function softmax(values, temperature) {
    var temp = Math.max(K.MATH.EPSILON, toNumber(temperature, 1));
    var peak = maximum(values);
    var exponentials = [];
    var denominator;
    var result = [];
    var i;
    for (i = 0; i < values.length; i += 1) {
      exponentials.push(Math.exp((values[i] - peak) / temp));
    }
    denominator = sum(exponentials);
    for (i = 0; i < exponentials.length; i += 1) {
      result.push(exponentials[i] / denominator);
    }
    return result;
  }

  function logSoftmax(values, temperature) {
    var probabilities = softmax(values, temperature);
    var result = [];
    var i;
    for (i = 0; i < probabilities.length; i += 1) {
      result.push(Math.log(Math.max(probabilities[i], K.MATH.EPSILON)));
    }
    return result;
  }

  function meanSquaredError(predicted, actual) {
    var length = Math.min(predicted.length, actual.length);
    var total = 0;
    var i;
    if (!length) {
      return 0;
    }
    for (i = 0; i < length; i += 1) {
      total += Math.pow(predicted[i] - actual[i], 2);
    }
    return total / length;
  }

  function binaryCrossEntropy(predicted, actual) {
    var probability = clamp(predicted, K.MATH.EPSILON, 1 - K.MATH.EPSILON);
    return -(actual * Math.log(probability) +
      (1 - actual) * Math.log(1 - probability));
  }

  function crossEntropy(probabilities, target) {
    var loss = 0;
    var i;
    if (typeof target === "number") {
      return -Math.log(Math.max(probabilities[target], K.MATH.EPSILON));
    }
    for (i = 0; i < probabilities.length; i += 1) {
      loss -= target[i] *
        Math.log(Math.max(probabilities[i], K.MATH.EPSILON));
    }
    return loss;
  }

  function argmax(values) {
    var bestIndex = 0;
    var bestValue;
    var i;
    if (!values.length) {
      return -1;
    }
    bestValue = values[0];
    for (i = 1; i < values.length; i += 1) {
      if (values[i] > bestValue) {
        bestValue = values[i];
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function topK(values, count) {
    var indexed = [];
    var limit = Math.max(0, Math.floor(count));
    var i;
    for (i = 0; i < values.length; i += 1) {
      indexed.push({
        index: i,
        value: values[i]
      });
    }
    indexed.sort(function (a, b) {
      return b.value - a.value;
    });
    return indexed.slice(0, limit);
  }

  function oneHot(index, size) {
    var result = [];
    var i;
    for (i = 0; i < size; i += 1) {
      result.push(i === index ? 1 : 0);
    }
    return result;
  }

  function accuracy(predicted, actual) {
    var length = Math.min(predicted.length, actual.length);
    var correct = 0;
    var i;
    if (!length) {
      return 0;
    }
    for (i = 0; i < length; i += 1) {
      if (predicted[i] === actual[i]) {
        correct += 1;
      }
    }
    return correct / length;
  }

  function precision(truePositive, falsePositive) {
    return safeDivide(truePositive, truePositive + falsePositive, 0);
  }

  function recall(truePositive, falseNegative) {
    return safeDivide(truePositive, truePositive + falseNegative, 0);
  }

  function f1Score(precisionValue, recallValue) {
    return safeDivide(
      2 * precisionValue * recallValue,
      precisionValue + recallValue,
      0
    );
  }

  function perceptronPredict(inputs, weights, bias, threshold) {
    return step(weightedSum(inputs, weights, bias), threshold);
  }

  function perceptronUpdate(inputs, weights, bias, target, learningRate) {
    var prediction = perceptronPredict(inputs, weights, bias, 0);
    var error = target - prediction;
    var rate = toNumber(learningRate, 1);
    var nextWeights = [];
    var i;
    for (i = 0; i < weights.length; i += 1) {
      nextWeights.push(weights[i] + rate * error * inputs[i]);
    }
    return {
      prediction: prediction,
      error: error,
      weights: nextWeights,
      bias: bias + rate * error
    };
  }

  function gradientStep(parameters, gradients, learningRate) {
    var result = [];
    var rate = toNumber(learningRate, K.TRAINING.DEFAULT_LEARNING_RATE);
    var i;
    for (i = 0; i < parameters.length; i += 1) {
      result.push(parameters[i] - rate * gradients[i]);
    }
    return result;
  }

  function momentumStep(parameters, gradients, velocity, learningRate, momentum) {
    var nextParameters = [];
    var nextVelocity = [];
    var rate = toNumber(learningRate, K.TRAINING.DEFAULT_LEARNING_RATE);
    var beta = toNumber(momentum, K.TRAINING.DEFAULT_MOMENTUM);
    var i;
    var currentVelocity;
    for (i = 0; i < parameters.length; i += 1) {
      currentVelocity = beta * velocity[i] + gradients[i];
      nextVelocity.push(currentVelocity);
      nextParameters.push(parameters[i] - rate * currentVelocity);
    }
    return {
      parameters: nextParameters,
      velocity: nextVelocity
    };
  }

  function adamStep(parameters, gradients, firstMoment, secondMoment, stepNumber, options) {
    var settings = options || {};
    var rate = toNumber(settings.learningRate, K.TRAINING.DEFAULT_LEARNING_RATE);
    var beta1 = toNumber(settings.beta1, K.TRAINING.ADAM_BETA1);
    var beta2 = toNumber(settings.beta2, K.TRAINING.ADAM_BETA2);
    var epsilon = toNumber(settings.epsilon, K.TRAINING.ADAM_EPSILON);
    var step = Math.max(1, Math.floor(stepNumber));
    var nextParameters = [];
    var nextFirstMoment = [];
    var nextSecondMoment = [];
    var i;
    var m;
    var v;
    var correctedM;
    var correctedV;

    for (i = 0; i < parameters.length; i += 1) {
      m = beta1 * firstMoment[i] + (1 - beta1) * gradients[i];
      v = beta2 * secondMoment[i] +
        (1 - beta2) * gradients[i] * gradients[i];
      correctedM = m / (1 - Math.pow(beta1, step));
      correctedV = v / (1 - Math.pow(beta2, step));
      nextFirstMoment.push(m);
      nextSecondMoment.push(v);
      nextParameters.push(
        parameters[i] -
        rate * correctedM / (Math.sqrt(correctedV) + epsilon)
      );
    }

    return {
      parameters: nextParameters,
      firstMoment: nextFirstMoment,
      secondMoment: nextSecondMoment
    };
  }

  function denseParameters(inputSize, outputSize, useBias) {
    return inputSize * outputSize + (useBias === false ? 0 : outputSize);
  }

  function convolutionParameters(kernelHeight, kernelWidth, inputChannels, outputChannels, useBias) {
    return kernelHeight * kernelWidth * inputChannels * outputChannels +
      (useBias === false ? 0 : outputChannels);
  }

  function depthwiseConvolutionParameters(kernelHeight, kernelWidth, inputChannels, multiplier, useBias) {
    var outputChannels = inputChannels * toNumber(multiplier, 1);
    return kernelHeight * kernelWidth * outputChannels +
      (useBias === false ? 0 : outputChannels);
  }

  function recurrentParameters(inputSize, hiddenSize, useBias) {
    return inputSize * hiddenSize +
      hiddenSize * hiddenSize +
      (useBias === false ? 0 : hiddenSize);
  }

  function lstmParameters(inputSize, hiddenSize, useBias) {
    var perGate = inputSize * hiddenSize + hiddenSize * hiddenSize;
    if (useBias !== false) {
      perGate += hiddenSize;
    }
    return K.ARCHITECTURE.LSTM_GATES * perGate;
  }

  function gruParameters(inputSize, hiddenSize, useBias) {
    var perGate = inputSize * hiddenSize + hiddenSize * hiddenSize;
    if (useBias !== false) {
      perGate += hiddenSize;
    }
    return K.ARCHITECTURE.GRU_GATES * perGate;
  }

  function embeddingParameters(vocabularySize, dimension) {
    return vocabularySize * dimension;
  }

  function layerNormParameters(dimension) {
    return K.ARCHITECTURE.LAYER_NORM_VECTORS * dimension;
  }

  function attentionParameters(modelDimension, useBias) {
    var bias = useBias === false ?
      0 :
      K.ARCHITECTURE.TRANSFORMER_PROJECTIONS * modelDimension;
    return K.ARCHITECTURE.TRANSFORMER_PROJECTIONS *
      modelDimension * modelDimension + bias;
  }

  function feedForwardParameters(modelDimension, hiddenDimension, useBias) {
    return modelDimension * hiddenDimension +
      hiddenDimension * modelDimension +
      (useBias === false ? 0 : hiddenDimension + modelDimension);
  }

  function transformerLayerParameters(modelDimension, hiddenDimension, useBias) {
    return attentionParameters(modelDimension, useBias) +
      feedForwardParameters(modelDimension, hiddenDimension, useBias) +
      K.ARCHITECTURE.TRANSFORMER_LAYER_NORMS *
      layerNormParameters(modelDimension);
  }

  function transformerParameters(config) {
    var vocabularySize = toNumber(config.vocabularySize, 0);
    var modelDimension = toNumber(config.modelDimension, 0);
    var hiddenDimension = toNumber(config.hiddenDimension, 0);
    var layers = toNumber(config.layers, 0);
    var contextLength = toNumber(config.contextLength, 0);
    var tokenEmbeddings = embeddingParameters(vocabularySize, modelDimension);
    var positionEmbeddings = config.learnedPositionEmbeddings === false ?
      0 :
      embeddingParameters(contextLength, modelDimension);
    var blocks = layers *
      transformerLayerParameters(
        modelDimension,
        hiddenDimension,
        config.useBias
      );
    var finalNorm = layerNormParameters(modelDimension);
    var output = config.tieEmbeddings === false ?
      denseParameters(modelDimension, vocabularySize, false) :
      0;

    return {
      tokenEmbeddings: tokenEmbeddings,
      positionEmbeddings: positionEmbeddings,
      blocks: blocks,
      finalNorm: finalNorm,
      output: output,
      total: tokenEmbeddings + positionEmbeddings + blocks + finalNorm + output
    };
  }

  function convolutionOutputSize(inputSize, kernelSize, stride, padding, dilation) {
    var stepSize = Math.max(1, toNumber(stride, 1));
    var pad = toNumber(padding, 0);
    var spacing = Math.max(1, toNumber(dilation, 1));
    return Math.floor(
      (inputSize + 2 * pad - spacing * (kernelSize - 1) - 1) /
      stepSize + 1
    );
  }

  function convolutionOutputShape(config) {
    return {
      height: convolutionOutputSize(
        config.inputHeight,
        config.kernelHeight,
        config.strideHeight,
        config.paddingHeight,
        config.dilationHeight
      ),
      width: convolutionOutputSize(
        config.inputWidth,
        config.kernelWidth,
        config.strideWidth,
        config.paddingWidth,
        config.dilationWidth
      ),
      channels: config.outputChannels
    };
  }

  function receptiveField(layers) {
    var field = 1;
    var jump = 1;
    var i;
    var kernel;
    var dilation;
    var stride;
    for (i = 0; i < layers.length; i += 1) {
      kernel = toNumber(layers[i].kernel, 1);
      dilation = toNumber(layers[i].dilation, 1);
      stride = toNumber(layers[i].stride, 1);
      field += (kernel - 1) * dilation * jump;
      jump *= stride;
    }
    return {
      size: field,
      jump: jump
    };
  }

  function denseMacs(inputSize, outputSize, examples) {
    return inputSize * outputSize * toNumber(examples, 1);
  }

  function convolutionMacs(config) {
    var output = convolutionOutputShape(config);
    return output.height *
      output.width *
      output.channels *
      config.kernelHeight *
      config.kernelWidth *
      config.inputChannels *
      toNumber(config.examples, 1);
  }

  function macsToFlops(macs) {
    return macs * K.TRAINING.FLOPS_PER_MAC;
  }

  function trainingFlops(parameters, tokens) {
    return K.TRAINING.APPROX_TRAINING_FLOPS_PER_PARAMETER_TOKEN *
      parameters * tokens;
  }

  function parameterMemory(parameters, bytesPerParameter) {
    return parameters *
      toNumber(bytesPerParameter, K.NUMERIC_FORMATS.FP32_BYTES);
  }

  function trainingStateMemory(parameters, bytesPerValue, optimizer) {
    var multiplier;
    if (optimizer === "adam") {
      multiplier = K.TRAINING.ADAM_STATE_MULTIPLIER;
    } else if (optimizer === "momentum") {
      multiplier = K.TRAINING.MOMENTUM_STATE_MULTIPLIER;
    } else {
      multiplier = K.TRAINING.SGD_STATE_MULTIPLIER;
    }
    return parameters *
      toNumber(bytesPerValue, K.NUMERIC_FORMATS.FP32_BYTES) *
      multiplier;
  }

  function throughput(work, seconds) {
    return safeDivide(work, seconds, 0);
  }

  function duration(work, rate) {
    return safeDivide(work, rate, 0);
  }

  function energyKilowattHours(powerWatts, seconds) {
    return powerWatts * seconds / K.UNITS.JOULE_PER_KILOWATT_HOUR;
  }

  function scaledDotProductAttention(query, keys, values, mask) {
    var dimension = query.length;
    var scale = Math.sqrt(Math.max(1, dimension));
    var scores = [];
    var weights;
    var result = [];
    var i;
    var j;

    for (i = 0; i < keys.length; i += 1) {
      scores.push(dot(query, keys[i]) / scale);
      if (mask && mask[i] === false) {
        scores[i] = -Infinity;
      }
    }

    weights = softmax(scores);

    for (j = 0; j < values[0].length; j += 1) {
      result[j] = 0;
      for (i = 0; i < values.length; i += 1) {
        result[j] += weights[i] * values[i][j];
      }
    }

    return {
      scores: scores,
      weights: weights,
      output: result
    };
  }

  function positionalEncoding(position, dimension, modelDimension) {
    var angle = position /
      Math.pow(10000, (2 * Math.floor(dimension / 2)) / modelDimension);
    return dimension % 2 === 0 ? Math.sin(angle) : Math.cos(angle);
  }

  function ratio(newValue, oldValue) {
    return safeDivide(newValue, oldValue, 0);
  }

  function percentage(part, whole) {
    return safeDivide(part, whole, 0) * 100;
  }

  function percentChange(newValue, oldValue) {
    return safeDivide(newValue - oldValue, oldValue, 0) * 100;
  }

  function errorReduction(oldError, newError) {
    return oldError - newError;
  }

  function relativeErrorReduction(oldError, newError) {
    return percentage(oldError - newError, oldError);
  }

  function compoundAnnualGrowthRate(startValue, endValue, years) {
    if (startValue <= 0 || endValue < 0 || years <= 0) {
      return 0;
    }
    return Math.pow(endValue / startValue, 1 / years) - 1;
  }

  function doublingTime(startValue, endValue, years) {
    var growth;
    if (startValue <= 0 || endValue <= startValue || years <= 0) {
      return Infinity;
    }
    growth = Math.log(endValue / startValue) / years;
    return K.MATH.LN2 / growth;
  }

  function exponentialValue(startValue, annualRate, years) {
    return startValue * Math.pow(1 + annualRate, years);
  }

  function logBase(value, base) {
    return Math.log(value) / Math.log(base);
  }

  function ordersOfMagnitude(newValue, oldValue) {
    if (newValue <= 0 || oldValue <= 0) {
      return 0;
    }
    return logBase(newValue / oldValue, 10);
  }

  function yearsBetween(startYear, endYear) {
    return endYear - startYear;
  }

  function yearProgress(year, startYear, endYear) {
    var start = toNumber(startYear, K.HISTORY.FIRST_YEAR);
    var end = toNumber(endYear, K.HISTORY.LAST_YEAR);
    return clamp(safeDivide(year - start, end - start, 0), 0, 1);
  }

  function pageProgress(index) {
    return clamp(index, 1, K.PAGE_COUNT) / K.PAGE_COUNT;
  }

  function pagePosition(index) {
    return safeDivide(
      clamp(index, 1, K.PAGE_COUNT) - 1,
      K.PAGE_COUNT - 1,
      0
    );
  }

  function eventById(id) {
    var i;
    for (i = 0; i < K.TIMELINE.length; i += 1) {
      if (K.TIMELINE[i].id === id) {
        return K.TIMELINE[i];
      }
    }
    return null;
  }

  function eventsBetween(startYear, endYear) {
    var result = [];
    var i;
    for (i = 0; i < K.TIMELINE.length; i += 1) {
      if (
        K.TIMELINE[i].year >= startYear &&
        K.TIMELINE[i].year <= endYear
      ) {
        result.push(K.TIMELINE[i]);
      }
    }
    return result;
  }

  function eventsByKind(kind) {
    var result = [];
    var i;
    for (i = 0; i < K.TIMELINE.length; i += 1) {
      if (K.TIMELINE[i].kind === kind) {
        result.push(K.TIMELINE[i]);
      }
    }
    return result;
  }

  function timelineSeries(startYear, endYear) {
    var events = eventsBetween(
      toNumber(startYear, K.HISTORY.FIRST_YEAR),
      toNumber(endYear, K.HISTORY.LAST_YEAR)
    );
    var result = [];
    var i;
    for (i = 0; i < events.length; i += 1) {
      result.push({
        id: events[i].id,
        year: events[i].year,
        title: events[i].title,
        kind: events[i].kind,
        progress: yearProgress(
          events[i].year,
          toNumber(startYear, K.HISTORY.FIRST_YEAR),
          toNumber(endYear, K.HISTORY.LAST_YEAR)
        )
      });
    }
    return result;
  }

  function eraForYear(year) {
    var i;
    for (i = 0; i < K.ERAS.length; i += 1) {
      if (year >= K.ERAS[i].start && year <= K.ERAS[i].end) {
        return K.ERAS[i];
      }
    }
    return null;
  }

  function eventGap(firstId, secondId) {
    var first = eventById(firstId);
    var second = eventById(secondId);
    return first && second ? second.year - first.year : null;
  }

  function modelById(id) {
    var key;
    for (key in K.MODELS) {
      if (
        Object.prototype.hasOwnProperty.call(K.MODELS, key) &&
        K.MODELS[key].id === id
      ) {
        return K.MODELS[key];
      }
    }
    return null;
  }

  function modelScale(firstId, secondId) {
    var first = modelById(firstId);
    var second = modelById(secondId);
    if (!first || !second) {
      return null;
    }
    return {
      first: first,
      second: second,
      years: second.year - first.year,
      ratio: ratio(second.parameters, first.parameters),
      percentChange: percentChange(second.parameters, first.parameters),
      ordersOfMagnitude: ordersOfMagnitude(
        second.parameters,
        first.parameters
      ),
      cagr: compoundAnnualGrowthRate(
        first.parameters,
        second.parameters,
        second.year - first.year
      ),
      doublingTime: doublingTime(
        first.parameters,
        second.parameters,
        second.year - first.year
      )
    };
  }

  function modelScaleSeries() {
    var result = [];
    var key;
    for (key in K.MODELS) {
      if (Object.prototype.hasOwnProperty.call(K.MODELS, key)) {
        result.push({
          id: K.MODELS[key].id,
          name: K.MODELS[key].name,
          year: K.MODELS[key].year,
          parameters: K.MODELS[key].parameters,
          logParameters: logBase(K.MODELS[key].parameters, 10)
        });
      }
    }
    result.sort(function (a, b) {
      return a.year - b.year;
    });
    return result;
  }

  function alexNetBreakthrough() {
    var oldError = K.BENCHMARKS.ILSVRC2012_RUNNER_UP_TOP5_ERROR;
    var newError = K.BENCHMARKS.ILSVRC2012_ALEXNET_TOP5_ERROR;
    return {
      runnerUpError: oldError,
      alexNetError: newError,
      absoluteReduction: errorReduction(oldError, newError),
      relativeReduction: relativeErrorReduction(oldError, newError)
    };
  }

  function historyStats() {
    return {
      firstYear: K.HISTORY.FIRST_YEAR,
      lastYear: K.HISTORY.LAST_YEAR,
      spanYears: yearsBetween(
        K.HISTORY.FIRST_YEAR,
        K.HISTORY.LAST_YEAR
      ),
      eventCount: K.TIMELINE.length,
      eraCount: K.ERAS.length,
      modelCount: modelScaleSeries().length
    };
  }

  function secondsFromMinutes(minutes) {
    return minutes * K.UNITS.SECOND_PER_MINUTE;
  }

  function secondsFromHours(hours) {
    return hours * K.UNITS.SECOND_PER_HOUR;
  }

  function secondsFromDays(days) {
    return days * K.UNITS.SECOND_PER_DAY;
  }

  function bytesFrom(value, unit) {
    var factors = {
      B: 1,
      KB: K.UNITS.BYTE_PER_KILOBYTE,
      MB: K.UNITS.BYTE_PER_MEGABYTE,
      GB: K.UNITS.BYTE_PER_GIGABYTE,
      TB: K.UNITS.BYTE_PER_TERABYTE,
      KiB: K.UNITS.BYTE_PER_KIBIBYTE,
      MiB: K.UNITS.BYTE_PER_MEBIBYTE,
      GiB: K.UNITS.BYTE_PER_GIBIBYTE,
      TiB: K.UNITS.BYTE_PER_TEBIBYTE
    };
    return value * (factors[unit] || 1);
  }

  function convertBytes(bytes, unit) {
    return bytesFrom(1, unit) === 0 ? 0 : bytes / bytesFrom(1, unit);
  }

  function pad(value, length) {
    var text = String(value);
    while (text.length < length) {
      text = "0" + text;
    }
    return text;
  }

  function addThousandsSeparators(value) {
    var parts = String(value).split(".");
    var sign = "";
    var integer = parts[0];
    var result = "";
    if (integer.charAt(0) === "-") {
      sign = "-";
      integer = integer.slice(1);
    }
    while (integer.length > 3) {
      result = "," + integer.slice(-3) + result;
      integer = integer.slice(0, -3);
    }
    return sign + integer + result +
      (parts.length > 1 ? "." + parts[1] : "");
  }

  function formatNumber(value, digits) {
    return addThousandsSeparators(round(value, toNumber(digits, 0)));
  }

  function formatCompact(value, digits) {
    var absolute = Math.abs(value);
    var scale = 1;
    var suffix = "";
    if (absolute >= K.UNITS.TRILLION) {
      scale = K.UNITS.TRILLION;
      suffix = "T";
    } else if (absolute >= K.UNITS.BILLION) {
      scale = K.UNITS.BILLION;
      suffix = "B";
    } else if (absolute >= K.UNITS.MILLION) {
      scale = K.UNITS.MILLION;
      suffix = "M";
    } else if (absolute >= K.UNITS.THOUSAND) {
      scale = K.UNITS.THOUSAND;
      suffix = "K";
    }
    return String(round(value / scale, toNumber(digits, 1))) + suffix;
  }

  function formatPercent(value, digits, alreadyPercent) {
    var percentValue = alreadyPercent ? value : value * 100;
    return String(round(percentValue, toNumber(digits, 1))) + "%";
  }

  function formatBytes(bytes, digits, binary) {
    var base = binary ?
      K.UNITS.BYTE_PER_KIBIBYTE :
      K.UNITS.BYTE_PER_KILOBYTE;
    var labels = binary ?
      ["B", "KiB", "MiB", "GiB", "TiB"] :
      ["B", "KB", "MB", "GB", "TB"];
    var value = Math.abs(bytes);
    var index = 0;
    while (value >= base && index < labels.length - 1) {
      value /= base;
      index += 1;
    }
    if (bytes < 0) {
      value = -value;
    }
    return String(round(value, toNumber(digits, 1))) + " " + labels[index];
  }

  function formatDuration(seconds, digits) {
    if (seconds >= K.UNITS.SECOND_PER_DAY) {
      return String(round(
        seconds / K.UNITS.SECOND_PER_DAY,
        toNumber(digits, 1)
      )) + " 天";
    }
    if (seconds >= K.UNITS.SECOND_PER_HOUR) {
      return String(round(
        seconds / K.UNITS.SECOND_PER_HOUR,
        toNumber(digits, 1)
      )) + " 小时";
    }
    if (seconds >= K.UNITS.SECOND_PER_MINUTE) {
      return String(round(
        seconds / K.UNITS.SECOND_PER_MINUTE,
        toNumber(digits, 1)
      )) + " 分钟";
    }
    return String(round(seconds, toNumber(digits, 1))) + " 秒";
  }

  var P = {
    isNumber: isNumber,
    toNumber: toNumber,
    clamp: clamp,
    round: round,
    safeDivide: safeDivide,
    sum: sum,
    mean: mean,
    median: median,
    variance: variance,
    standardDeviation: standardDeviation,
    minimum: minimum,
    maximum: maximum,
    normalize: normalize,

    dot: dot,
    vectorAdd: vectorAdd,
    vectorSubtract: vectorSubtract,
    vectorScale: vectorScale,
    vectorNorm: vectorNorm,
    cosineSimilarity: cosineSimilarity,
    transpose: transpose,
    matrixMultiply: matrixMultiply,

    weightedSum: weightedSum,
    step: step,
    sigmoid: sigmoid,
    sigmoidDerivative: sigmoidDerivative,
    tanh: tanh,
    tanhDerivative: tanhDerivative,
    relu: relu,
    reluDerivative: reluDerivative,
    leakyRelu: leakyRelu,
    elu: elu,
    gelu: gelu,
    softmax: softmax,
    logSoftmax: logSoftmax,

    meanSquaredError: meanSquaredError,
    binaryCrossEntropy: binaryCrossEntropy,
    crossEntropy: crossEntropy,
    argmax: argmax,
    topK: topK,
    oneHot: oneHot,
    accuracy: accuracy,
    precision: precision,
    recall: recall,
    f1Score: f1Score,

    perceptronPredict: perceptronPredict,
    perceptronUpdate: perceptronUpdate,
    gradientStep: gradientStep,
    momentumStep: momentumStep,
    adamStep: adamStep,

    denseParameters: denseParameters,
    convolutionParameters: convolutionParameters,
    depthwiseConvolutionParameters: depthwiseConvolutionParameters,
    recurrentParameters: recurrentParameters,
    lstmParameters: lstmParameters,
    gruParameters: gruParameters,
    embeddingParameters: embeddingParameters,
    layerNormParameters: layerNormParameters,
    attentionParameters: attentionParameters,
    feedForwardParameters: feedForwardParameters,
    transformerLayerParameters: transformerLayerParameters,
    transformerParameters: transformerParameters,

    convolutionOutputSize: convolutionOutputSize,
    convolutionOutputShape: convolutionOutputShape,
    receptiveField: receptiveField,
    denseMacs: denseMacs,
    convolutionMacs: convolutionMacs,
    macsToFlops: macsToFlops,
    trainingFlops: trainingFlops,
    parameterMemory: parameterMemory,
    trainingStateMemory: trainingStateMemory,
    throughput: throughput,
    duration: duration,
    energyKilowattHours: energyKilowattHours,

    scaledDotProductAttention: scaledDotProductAttention,
    positionalEncoding: positionalEncoding,

    ratio: ratio,
    percentage: percentage,
    percentChange: percentChange,
    errorReduction: errorReduction,
    relativeErrorReduction: relativeErrorReduction,
    compoundAnnualGrowthRate: compoundAnnualGrowthRate,
    doublingTime: doublingTime,
    exponentialValue: exponentialValue,
    logBase: logBase,
    ordersOfMagnitude: ordersOfMagnitude,

    yearsBetween: yearsBetween,
    yearProgress: yearProgress,
    pageProgress: pageProgress,
    pagePosition: pagePosition,
    eventById: eventById,
    eventsBetween: eventsBetween,
    eventsByKind: eventsByKind,
    timelineSeries: timelineSeries,
    eraForYear: eraForYear,
    eventGap: eventGap,
    modelById: modelById,
    modelScale: modelScale,
    modelScaleSeries: modelScaleSeries,
    alexNetBreakthrough: alexNetBreakthrough,
    historyStats: historyStats,

    secondsFromMinutes: secondsFromMinutes,
    secondsFromHours: secondsFromHours,
    secondsFromDays: secondsFromDays,
    bytesFrom: bytesFrom,
    convertBytes: convertBytes,

    pad: pad,
    formatNumber: formatNumber,
    formatCompact: formatCompact,
    formatPercent: formatPercent,
    formatBytes: formatBytes,
    formatDuration: formatDuration
  };

  deepFreeze(P);

  function createElement(documentRef, tagName, className, text) {
    var element = documentRef.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (typeof text !== "undefined" && text !== null) {
      element.appendChild(documentRef.createTextNode(String(text)));
    }
    return element;
  }

  function removeById(documentRef, id) {
    var existing = documentRef.getElementById(id);
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function renderMount(cfg) {
    var documentRef = root.document;
    var body;
    var index;
    var kicker;
    var title;
    var take;
    var header;
    var headerInner;
    var meta;
    var kickerNode;
    var pageNode;
    var titleNode;
    var takeNode;
    var footer;
    var footerInner;
    var progress;
    var progressBar;
    var footerTopic;
    var footerPage;
    var completion;

    if (!documentRef || !documentRef.body) {
      return null;
    }

    body = documentRef.body;
    index = Math.floor(toNumber(cfg.index, 1));
    index = clamp(index, 1, K.PAGE_COUNT);
    kicker = typeof cfg.kicker === "undefined" ?
      K.UI.DEFAULT_KICKER :
      cfg.kicker;
    title = typeof cfg.title === "undefined" ? K.TOPIC : cfg.title;
    take = typeof cfg.take === "undefined" ? K.UI.DEFAULT_TAKE : cfg.take;
    completion = pageProgress(index);

    removeById(documentRef, K.UI.HEADER_ID);
    removeById(documentRef, K.UI.FOOTER_ID);

    header = createElement(documentRef, "header", K.UI.HEADER_CLASS);
    header.id = K.UI.HEADER_ID;
    header.setAttribute("data-lec-page", String(index));

    headerInner = createElement(
      documentRef,
      "div",
      K.UI.HEADER_CLASS + "__inner"
    );

    meta = createElement(
      documentRef,
      "div",
      K.UI.HEADER_CLASS + "__meta"
    );

    if (kicker !== null && String(kicker) !== "") {
      kickerNode = createElement(
        documentRef,
        "span",
        K.UI.HEADER_CLASS + "__kicker",
        kicker
      );
      meta.appendChild(kickerNode);
    }

    pageNode = createElement(
      documentRef,
      "span",
      K.UI.HEADER_CLASS + "__page",
      pad(index, 2) + " / " + pad(K.PAGE_COUNT, 2)
    );

    meta.appendChild(pageNode);
    headerInner.appendChild(meta);

    titleNode = createElement(
      documentRef,
      "h1",
      K.UI.HEADER_CLASS + "__title",
      title
    );
    headerInner.appendChild(titleNode);

    if (take !== null && String(take) !== "") {
      takeNode = createElement(
        documentRef,
        "p",
        K.UI.HEADER_CLASS + "__take",
        take
      );
      headerInner.appendChild(takeNode);
    }

    header.appendChild(headerInner);

    footer = createElement(documentRef, "footer", K.UI.FOOTER_CLASS);
    footer.id = K.UI.FOOTER_ID;
    footer.setAttribute("data-lec-page", String(index));

    footerInner = createElement(
      documentRef,
      "div",
      K.UI.FOOTER_CLASS + "__inner"
    );

    progress = createElement(
      documentRef,
      "div",
      K.UI.FOOTER_CLASS + "__progress"
    );
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", K.UI.PROGRESS_LABEL);
    progress.setAttribute("aria-valuemin", "1");
    progress.setAttribute("aria-valuemax", String(K.PAGE_COUNT));
    progress.setAttribute("aria-valuenow", String(index));
    progress.setAttribute(
      "aria-valuetext",
      formatPercent(completion, 0, false)
    );

    progressBar = createElement(
      documentRef,
      "span",
      K.UI.FOOTER_CLASS + "__progress-bar"
    );
    progressBar.style.width = formatPercent(completion, 2, false);
    progress.appendChild(progressBar);
    footerInner.appendChild(progress);

    footerTopic = createElement(
      documentRef,
      "span",
      K.UI.FOOTER_CLASS + "__topic",
      K.TOPIC
    );
    footerInner.appendChild(footerTopic);

    footerPage = createElement(
      documentRef,
      "span",
      K.UI.FOOTER_CLASS + "__page",
      K.UI.PAGE_PREFIX + index + K.UI.PAGE_MIDDLE +
      K.PAGE_COUNT + K.UI.PAGE_LABEL
    );
    footerInner.appendChild(footerPage);

    footer.appendChild(footerInner);

    body.insertBefore(header, body.firstChild);
    body.appendChild(footer);

    return {
      header: header,
      footer: footer,
      index: index,
      progress: completion
    };
  }

  var pendingConfig = null;
  var mountWaiting = false;

  function flushPendingMount() {
    var config = pendingConfig;
    pendingConfig = null;
    mountWaiting = false;
    if (config) {
      renderMount(config);
    }
  }

  function mount(cfg) {
    var documentRef = root.document;
    var config = cfg || {};

    if (!documentRef) {
      return null;
    }

    if (documentRef.body) {
      return renderMount(config);
    }

    pendingConfig = config;

    if (!mountWaiting) {
      mountWaiting = true;
      if (documentRef.addEventListener) {
        documentRef.addEventListener(
          "DOMContentLoaded",
          flushPendingMount,
          false
        );
      } else if (documentRef.attachEvent) {
        documentRef.attachEvent("onreadystatechange", function () {
          if (documentRef.readyState === "complete") {
            flushPendingMount();
          }
        });
      }
    }

    return null;
  }

  root.Lec = {
    K: K,
    P: P,
    mount: mount
  };

  deepFreeze(root.Lec);
}(typeof window !== "undefined" ? window : this));