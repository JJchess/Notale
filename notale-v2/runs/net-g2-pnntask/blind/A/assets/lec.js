(function (root) {
  "use strict";

  var Lec = {};

  Lec.K = {
    probabilityEpsilon: 1e-12,
    fractionToPercent: 100,
    natsToBits: Math.LOG2E,
    sigmoidAtZero: 0.5,
    sigmoidMaximumDerivative: 0.25,
    reluDerivativeAtZero: 0,
    weightLayout: "weights[outputIndex][inputIndex]"
  };

  function assertArray(value, name) {
    if (!value || typeof value.length !== "number") {
      throw new TypeError(name + " must be an array");
    }
  }

  function copyVector(values) {
    var result = [];
    var i;

    for (i = 0; i < values.length; i += 1) {
      result.push(values[i]);
    }

    return result;
  }

  function stableSigmoid(x) {
    var e;

    if (x >= 0) {
      return 1 / (1 + Math.exp(-x));
    }

    e = Math.exp(x);
    return e / (1 + e);
  }

  function tanh(x) {
    var e;

    if (x >= 0) {
      e = Math.exp(-2 * x);
      return (1 - e) / (1 + e);
    }

    e = Math.exp(2 * x);
    return (e - 1) / (e + 1);
  }

  function scalarActivation(name, x) {
    if (name === "linear") {
      return x;
    }
    if (name === "sigmoid") {
      return stableSigmoid(x);
    }
    if (name === "tanh") {
      return tanh(x);
    }
    if (name === "relu") {
      return x > 0 ? x : 0;
    }

    throw new Error("Unknown scalar activation: " + name);
  }

  function scalarActivationDerivative(name, z, output) {
    if (name === "linear") {
      return 1;
    }
    if (name === "sigmoid") {
      return output * (1 - output);
    }
    if (name === "tanh") {
      return 1 - output * output;
    }
    if (name === "relu") {
      return z > 0 ? 1 : Lec.K.reluDerivativeAtZero;
    }

    throw new Error("Unknown scalar activation: " + name);
  }

  function activateVector(name, values) {
    var result = [];
    var maximum;
    var total;
    var i;

    if (name === "softmax") {
      if (values.length === 0) {
        return result;
      }

      maximum = values[0];
      for (i = 1; i < values.length; i += 1) {
        if (values[i] > maximum) {
          maximum = values[i];
        }
      }

      total = 0;
      for (i = 0; i < values.length; i += 1) {
        result[i] = Math.exp(values[i] - maximum);
        total += result[i];
      }

      for (i = 0; i < result.length; i += 1) {
        result[i] /= total;
      }

      return result;
    }

    for (i = 0; i < values.length; i += 1) {
      result.push(scalarActivation(name, values[i]));
    }

    return result;
  }

  function activationBackward(name, z, output, upstream) {
    var result = [];
    var dot = 0;
    var i;

    if (name === "softmax") {
      for (i = 0; i < output.length; i += 1) {
        dot += upstream[i] * output[i];
      }

      for (i = 0; i < output.length; i += 1) {
        result[i] = output[i] * (upstream[i] - dot);
      }

      return result;
    }

    for (i = 0; i < output.length; i += 1) {
      result[i] = upstream[i] *
        scalarActivationDerivative(name, z[i], output[i]);
    }

    return result;
  }

  function clampProbability(value) {
    var epsilon = Lec.K.probabilityEpsilon;

    if (value < epsilon) {
      return epsilon;
    }
    if (value > 1 - epsilon) {
      return 1 - epsilon;
    }

    return value;
  }

  Lec.P = {
    weightedSum: function (inputs, weights, bias) {
      var sum = typeof bias === "number" ? bias : 0;
      var i;

      assertArray(inputs, "inputs");
      assertArray(weights, "weights");

      if (inputs.length !== weights.length) {
        throw new Error("inputs and weights must have equal lengths");
      }

      for (i = 0; i < inputs.length; i += 1) {
        sum += inputs[i] * weights[i];
      }

      return sum;
    },

    activation: function (name, x) {
      return scalarActivation(name, x);
    },

    activationDerivative: function (name, z, output) {
      var y = typeof output === "number"
        ? output
        : scalarActivation(name, z);

      return scalarActivationDerivative(name, z, y);
    },

    neuronForward: function (inputs, weights, bias, activationName) {
      var z = Lec.P.weightedSum(inputs, weights, bias);
      var output = scalarActivation(activationName || "linear", z);

      return {
        z: z,
        output: output
      };
    },

    denseForward: function (inputs, weights, biases, activationName) {
      var z = [];
      var outputs;
      var i;

      assertArray(inputs, "inputs");
      assertArray(weights, "weights");
      assertArray(biases, "biases");

      if (weights.length !== biases.length) {
        throw new Error("weights and biases must describe the same outputs");
      }

      for (i = 0; i < weights.length; i += 1) {
        z.push(Lec.P.weightedSum(inputs, weights[i], biases[i]));
      }

      outputs = activateVector(activationName || "linear", z);

      return {
        inputs: copyVector(inputs),
        z: z,
        outputs: outputs
      };
    },

    lossValueAndGradient: function (predictions, targets, lossName) {
      var gradient = [];
      var value = 0;
      var count;
      var p;
      var y;
      var i;

      assertArray(predictions, "predictions");
      assertArray(targets, "targets");

      if (predictions.length !== targets.length || predictions.length === 0) {
        throw new Error(
          "predictions and targets must have equal nonzero lengths"
        );
      }

      count = predictions.length;

      if (lossName === "halfMeanSquaredError") {
        for (i = 0; i < count; i += 1) {
          p = predictions[i] - targets[i];
          value += 0.5 * p * p;
          gradient[i] = p / count;
        }

        return {
          value: value / count,
          gradient: gradient,
          unit: "squared output units"
        };
      }

      if (lossName === "binaryCrossEntropy") {
        for (i = 0; i < count; i += 1) {
          p = clampProbability(predictions[i]);
          y = targets[i];
          value -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
          gradient[i] = ((1 - y) / (1 - p) - y / p) / count;
        }

        return {
          value: value / count,
          gradient: gradient,
          unit: "nats"
        };
      }

      if (lossName === "categoricalCrossEntropy") {
        for (i = 0; i < count; i += 1) {
          p = clampProbability(predictions[i]);
          y = targets[i];
          value -= y * Math.log(p);
          gradient[i] = -y / p;
        }

        return {
          value: value,
          gradient: gradient,
          unit: "nats"
        };
      }

      throw new Error("Unknown loss: " + lossName);
    },

    forwardNetwork: function (inputs, layers) {
      var activations = [copyVector(inputs)];
      var preActivations = [];
      var current = copyVector(inputs);
      var step;
      var layer;
      var i;

      assertArray(layers, "layers");

      for (i = 0; i < layers.length; i += 1) {
        layer = layers[i];
        step = Lec.P.denseForward(
          current,
          layer.weights,
          layer.biases,
          layer.activation || "linear"
        );

        preActivations.push(step.z);
        activations.push(step.outputs);
        current = step.outputs;
      }

      return {
        output: current,
        activations: activations,
        preActivations: preActivations
      };
    },

    backpropNetwork: function (inputs, layers, targets, lossName) {
      var forward = Lec.P.forwardNetwork(inputs, layers);
      var loss = Lec.P.lossValueAndGradient(
        forward.output,
        targets,
        lossName
      );
      var gradients = [];
      var upstream = loss.gradient;
      var layer;
      var z;
      var output;
      var input;
      var delta;
      var weightGradients;
      var biasGradients;
      var previousUpstream;
      var row;
      var i;
      var j;
      var k;

      for (i = layers.length - 1; i >= 0; i -= 1) {
        layer = layers[i];
        z = forward.preActivations[i];
        output = forward.activations[i + 1];
        input = forward.activations[i];

        delta = activationBackward(
          layer.activation || "linear",
          z,
          output,
          upstream
        );

        weightGradients = [];
        biasGradients = copyVector(delta);
        previousUpstream = [];

        for (k = 0; k < input.length; k += 1) {
          previousUpstream[k] = 0;
        }

        for (j = 0; j < layer.weights.length; j += 1) {
          row = [];

          for (k = 0; k < layer.weights[j].length; k += 1) {
            row[k] = delta[j] * input[k];
            previousUpstream[k] += layer.weights[j][k] * delta[j];
          }

          weightGradients.push(row);
        }

        gradients[i] = {
          weights: weightGradients,
          biases: biasGradients
        };

        upstream = previousUpstream;
      }

      return {
        loss: loss.value,
        lossUnit: loss.unit,
        predictions: forward.output,
        activations: forward.activations,
        preActivations: forward.preActivations,
        gradients: gradients,
        inputGradient: upstream
      };
    },

    sgdStep: function (layers, gradients, learningRate) {
      var updated = [];
      var weights;
      var biases;
      var row;
      var i;
      var j;
      var k;

      if (typeof learningRate !== "number" || learningRate < 0) {
        throw new Error("learningRate must be a nonnegative number");
      }

      if (layers.length !== gradients.length) {
        throw new Error("layers and gradients must have equal lengths");
      }

      for (i = 0; i < layers.length; i += 1) {
        weights = [];
        biases = [];

        for (j = 0; j < layers[i].weights.length; j += 1) {
          row = [];

          for (k = 0; k < layers[i].weights[j].length; k += 1) {
            row[k] = layers[i].weights[j][k] -
              learningRate * gradients[i].weights[j][k];
          }

          weights.push(row);
          biases[j] = layers[i].biases[j] -
            learningRate * gradients[i].biases[j];
        }

        updated.push({
          weights: weights,
          biases: biases,
          activation: layers[i].activation || "linear"
        });
      }

      return updated;
    }
  };

  root.Lec = Lec;
}(
  typeof window !== "undefined"
    ? window
    : typeof global !== "undefined"
      ? global
      : this
));
