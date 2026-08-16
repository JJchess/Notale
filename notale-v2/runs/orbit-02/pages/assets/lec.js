(function (global) {
  "use strict";

  var K = {
    version: "1.0.0",
    pageCount: 20,

    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    HALF_PI: Math.PI / 2,
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI,

    G: 6.67430e-11,
    g0: 9.80665,
    c: 299792458,
    AU: 149597870700,

    units: {
      m: 1,
      km: 1000,
      cm: 0.01,
      mm: 0.001,
      um: 1e-6,
      nm: 1e-9,
      ft: 0.3048,
      mile: 1609.344,
      nmi: 1852,

      s: 1,
      min: 60,
      h: 3600,
      day: 86400,
      year: 31557600,

      kg: 1,
      g: 0.001,
      tonne: 1000,
      lb: 0.45359237,

      N: 1,
      kN: 1000,
      MN: 1e6,

      Pa: 1,
      kPa: 1000,
      MPa: 1e6,
      bar: 100000,
      atm: 101325,

      J: 1,
      kJ: 1000,
      MJ: 1e6,
      GJ: 1e9,
      Wh: 3600,
      kWh: 3.6e6,

      W: 1,
      kW: 1000,
      MW: 1e6,
      GW: 1e9,

      rad: 1,
      deg: Math.PI / 180,

      mps: 1,
      kps: 1000,
      kph: 1 / 3.6,
      mph: 0.44704
    },

    time: {
      minute: 60,
      hour: 3600,
      day: 86400,
      julianYear: 31557600,
      tropicalYear: 31556925.216
    },

    earth: {
      mass: 5.9722e24,
      meanRadius: 6371008.8,
      equatorialRadius: 6378137,
      polarRadius: 6356752.314245,
      mu: 3.986004418e14,
      surfaceGravity: 9.80665,
      siderealDay: 86164.0905,
      solarDay: 86400,
      rotationRate: 7.2921150e-5,
      escapeSpeedSurface: 11186,
      circumference: 40075016.686,
      axialTilt: 23.439281 * Math.PI / 180,
      J2: 1.08262668e-3,
      meanSunDistance: 149597870700
    },

    moon: {
      mass: 7.342e22,
      meanRadius: 1737400,
      mu: 4.9048695e12,
      surfaceGravity: 1.62,
      meanEarthDistance: 384400000,
      siderealPeriod: 2360591.5,
      escapeSpeedSurface: 2380
    },

    sun: {
      mass: 1.98847e30,
      meanRadius: 695700000,
      mu: 1.32712440018e20,
      luminosity: 3.828e26
    },

    atmosphere: {
      seaLevelPressure: 101325,
      seaLevelDensity: 1.225,
      seaLevelTemperature: 288.15,
      seaLevelSoundSpeed: 340.294,
      specificGasConstant: 287.05287,
      heatCapacityRatio: 1.4,
      molarMass: 0.0289644,
      scaleHeight: 8500,
      maxIsaAltitude: 84852,
      thermosphereTemperature: 1000,
      layers: [
        { altitude: 0, temperature: 288.15, pressure: 101325, lapse: -0.0065 },
        { altitude: 11000, temperature: 216.65, pressure: 22632.06, lapse: 0 },
        { altitude: 20000, temperature: 216.65, pressure: 5474.889, lapse: 0.001 },
        { altitude: 32000, temperature: 228.65, pressure: 868.0187, lapse: 0.0028 },
        { altitude: 47000, temperature: 270.65, pressure: 110.9063, lapse: 0 },
        { altitude: 51000, temperature: 270.65, pressure: 66.93887, lapse: -0.0028 },
        { altitude: 71000, temperature: 214.65, pressure: 3.956420, lapse: -0.002 },
        { altitude: 84852, temperature: 186.946, pressure: 0.3734, lapse: 0 }
      ],
      upperDensity: [
        { altitude: 84852, density: 6.96e-6 },
        { altitude: 100000, density: 5.6e-7 },
        { altitude: 150000, density: 2.07e-9 },
        { altitude: 200000, density: 2.79e-10 },
        { altitude: 250000, density: 7.25e-11 },
        { altitude: 300000, density: 2.42e-11 },
        { altitude: 400000, density: 3.89e-12 },
        { altitude: 500000, density: 1.06e-12 },
        { altitude: 600000, density: 3.20e-13 },
        { altitude: 700000, density: 1.15e-13 },
        { altitude: 800000, density: 5.55e-14 },
        { altitude: 900000, density: 3.10e-14 },
        { altitude: 1000000, density: 1.80e-14 }
      ]
    },

    orbit: {
      karmanAltitude: 100000,
      veryLowEarthAltitude: 200000,
      lowEarthAltitude: 400000,
      issNominalAltitude: 408000,
      mediumEarthAltitude: 20200000,
      gpsAltitude: 20200000,
      geostationaryAltitude: 35786000,
      geostationaryRadius: 42164000,
      graveyardOffset: 300000,
      leoTypicalSpeed: 7800,
      leoTypicalPeriod: 5400
    },

    rocket: {
      solidIsp: 250,
      keroloxSeaLevelIsp: 282,
      keroloxVacuumIsp: 330,
      hydroloxVacuumIsp: 450,
      methaneVacuumIsp: 380,
      ionIsp: 3000,
      hallEffectIsp: 1600,
      launchToLeoDeltaV: 9400,
      leoOrbitalSpeed: 7800,
      typicalGravityLoss: 1200,
      typicalDragLoss: 150,
      typicalSteeringLoss: 150,
      typicalTotalLoss: 1500
    },

    reentry: {
      suttonGravesCoefficient: 1.83e-4
    },

    vehicles: {
      v2: {
        height: 14,
        liftoffMass: 12500,
        thrust: 270000,
        maxAltitude: 206000
      },
      saturnV: {
        height: 110.6,
        liftoffMass: 2.97e6,
        liftoffThrust: 35.1e6,
        payloadToLeo: 140000
      },
      falcon9: {
        height: 70,
        liftoffMass: 549054,
        liftoffThrust: 7.607e6,
        payloadToLeo: 22800,
        firstStageSeaLevelIsp: 282,
        firstStageVacuumIsp: 311,
        secondStageVacuumIsp: 348
      }
    },

    numeric: {
      epsilon: 1e-12,
      solverIterations: 80,
      integrationSteps: 400
    },

    display: {
      defaultDecimals: 2,
      percentDecimals: 1,
      pageDigits: 2,
      siThreshold: 1000
    },

    ui: {
      topic: "火箭与轨道",
      subtitle: "怎么把东西送上太空，并让它待在那儿",
      pagePrefix: "第 ",
      pageMiddle: " / ",
      pageSuffix: " 页",
      titleSeparator: "｜"
    }
  };

  K.EARTH_MASS = K.earth.mass;
  K.EARTH_RADIUS = K.earth.meanRadius;
  K.EARTH_EQUATORIAL_RADIUS = K.earth.equatorialRadius;
  K.EARTH_MU = K.earth.mu;
  K.EARTH_ROTATION_RATE = K.earth.rotationRate;
  K.EARTH_SIDEREAL_DAY = K.earth.siderealDay;
  K.MOON_MASS = K.moon.mass;
  K.MOON_RADIUS = K.moon.meanRadius;
  K.MOON_MU = K.moon.mu;
  K.SUN_MASS = K.sun.mass;
  K.SUN_RADIUS = K.sun.meanRadius;
  K.SUN_MU = K.sun.mu;
  K.KARMAN_ALTITUDE = K.orbit.karmanAltitude;
  K.ISS_ALTITUDE = K.orbit.issNominalAltitude;
  K.GEO_ALTITUDE = K.orbit.geostationaryAltitude;

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function finiteOr(value, fallback) {
    return isNumber(value) ? value : fallback;
  }

  function bodyOrEarth(body) {
    return body || K.earth;
  }

  function bodyRadius(body) {
    body = bodyOrEarth(body);
    return finiteOr(body.meanRadius, finiteOr(body.radius, K.earth.meanRadius));
  }

  function bodyMu(body) {
    body = bodyOrEarth(body);
    if (isNumber(body.mu)) {
      return body.mu;
    }
    if (isNumber(body.mass)) {
      return K.G * body.mass;
    }
    return K.earth.mu;
  }

  function normalizeAngle(angle) {
    var result = angle % K.TWO_PI;
    return result < 0 ? result + K.TWO_PI : result;
  }

  function pad(value, width) {
    var text = String(Math.floor(Math.abs(value)));
    var sign = value < 0 ? "-" : "";
    while (text.length < width) {
      text = "0" + text;
    }
    return sign + text;
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function appendTextElement(doc, parent, tag, className, text) {
    var element = doc.createElement(tag);
    if (className) {
      element.className = className;
    }
    element.appendChild(doc.createTextNode(text == null ? "" : String(text)));
    parent.appendChild(element);
    return element;
  }

  var P = {};

  P.isNumber = isNumber;

  P.clamp = function (value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  };

  P.lerp = function (start, end, fraction) {
    return start + (end - start) * fraction;
  };

  P.inverseLerp = function (start, end, value) {
    return (value - start) / (end - start);
  };

  P.round = function (value, decimals) {
    var places = finiteOr(decimals, K.display.defaultDecimals);
    var factor = Math.pow(10, places);
    return Math.round(value * factor) / factor;
  };

  P.significant = function (value, digits) {
    var count = finiteOr(digits, K.display.defaultDecimals + 1);
    var power;
    if (value === 0) {
      return 0;
    }
    power = count - Math.ceil(Math.log(Math.abs(value)) / Math.LN10);
    return P.round(value, power);
  };

  P.sum = function (values) {
    var total = 0;
    var i;
    for (i = 0; i < values.length; i += 1) {
      total += finiteOr(values[i], 0);
    }
    return total;
  };

  P.mean = function (values) {
    return values.length ? P.sum(values) / values.length : NaN;
  };

  P.range = function (start, end, count) {
    var result = [];
    var length = Math.max(1, Math.floor(count));
    var i;
    if (length === 1) {
      return [start];
    }
    for (i = 0; i < length; i += 1) {
      result.push(P.lerp(start, end, i / (length - 1)));
    }
    return result;
  };

  P.sample = function (start, end, count, fn) {
    var xs = P.range(start, end, count);
    var result = [];
    var i;
    for (i = 0; i < xs.length; i += 1) {
      result.push({ x: xs[i], y: fn(xs[i], i) });
    }
    return result;
  };

  P.convert = function (value, fromUnit, toUnit) {
    var from = K.units[fromUnit];
    var to = K.units[toUnit];
    return isNumber(from) && isNumber(to) ? value * from / to : NaN;
  };

  P.toRadians = function (degrees) {
    return degrees * K.DEG_TO_RAD;
  };

  P.toDegrees = function (radians) {
    return radians * K.RAD_TO_DEG;
  };

  P.celsiusToKelvin = function (celsius) {
    return celsius + 273.15;
  };

  P.kelvinToCelsius = function (kelvin) {
    return kelvin - 273.15;
  };

  P.celsiusToFahrenheit = function (celsius) {
    return celsius * 9 / 5 + 32;
  };

  P.fahrenheitToCelsius = function (fahrenheit) {
    return (fahrenheit - 32) * 5 / 9;
  };

  P.formatNumber = function (value, decimals) {
    var places = finiteOr(decimals, K.display.defaultDecimals);
    if (!isNumber(value)) {
      return "—";
    }
    return P.round(value, places).toLocaleString ?
      P.round(value, places).toLocaleString() :
      String(P.round(value, places));
  };

  P.formatPercent = function (fraction, decimals) {
    return P.formatNumber(fraction * 100, finiteOr(decimals, K.display.percentDecimals)) + "%";
  };

  P.formatSI = function (value, unit, decimals) {
    var absolute = Math.abs(value);
    var prefixes = [
      { scale: 1e12, symbol: "T" },
      { scale: 1e9, symbol: "G" },
      { scale: 1e6, symbol: "M" },
      { scale: 1e3, symbol: "k" },
      { scale: 1, symbol: "" },
      { scale: 1e-3, symbol: "m" },
      { scale: 1e-6, symbol: "μ" },
      { scale: 1e-9, symbol: "n" }
    ];
    var chosen = prefixes[prefixes.length - 1];
    var i;
    if (!isNumber(value)) {
      return "—";
    }
    for (i = 0; i < prefixes.length; i += 1) {
      if (absolute >= prefixes[i].scale) {
        chosen = prefixes[i];
        break;
      }
    }
    if (value === 0) {
      chosen = prefixes[4];
    }
    return P.formatNumber(value / chosen.scale, decimals) + " " + chosen.symbol + (unit || "");
  };

  P.formatDuration = function (seconds, decimals) {
    var sign = seconds < 0 ? "-" : "";
    var value = Math.abs(seconds);
    var unit;
    var scale;
    if (value >= K.time.day) {
      unit = "天";
      scale = K.time.day;
    } else if (value >= K.time.hour) {
      unit = "小时";
      scale = K.time.hour;
    } else if (value >= K.time.minute) {
      unit = "分钟";
      scale = K.time.minute;
    } else {
      unit = "秒";
      scale = 1;
    }
    return sign + P.formatNumber(value / scale, decimals) + " " + unit;
  };

  P.formatDistance = function (metres, decimals) {
    if (Math.abs(metres) >= K.units.km) {
      return P.formatNumber(metres / K.units.km, decimals) + " km";
    }
    return P.formatNumber(metres, decimals) + " m";
  };

  P.formatSpeed = function (metresPerSecond, decimals) {
    if (Math.abs(metresPerSecond) >= K.units.kps) {
      return P.formatNumber(metresPerSecond / K.units.kps, decimals) + " km/s";
    }
    return P.formatNumber(metresPerSecond, decimals) + " m/s";
  };

  P.formatMass = function (kilograms, decimals) {
    if (Math.abs(kilograms) >= K.units.tonne) {
      return P.formatNumber(kilograms / K.units.tonne, decimals) + " t";
    }
    return P.formatNumber(kilograms, decimals) + " kg";
  };

  P.pageLabel = function (index) {
    return K.ui.pagePrefix +
      pad(index, K.display.pageDigits) +
      K.ui.pageMiddle +
      pad(K.pageCount, K.display.pageDigits) +
      K.ui.pageSuffix;
  };

  P.gravitationalForce = function (massA, massB, distance) {
    return K.G * massA * massB / (distance * distance);
  };

  P.gravityAtRadius = function (radius, body) {
    return bodyMu(body) / (radius * radius);
  };

  P.gravityAtAltitude = function (altitude, body) {
    var radius = bodyRadius(body) + altitude;
    return P.gravityAtRadius(radius, body);
  };

  P.weight = function (mass, altitude, body) {
    return mass * P.gravityAtAltitude(finiteOr(altitude, 0), body);
  };

  P.potentialEnergyChange = function (mass, radiusFrom, radiusTo, body) {
    return bodyMu(body) * mass * (1 / radiusFrom - 1 / radiusTo);
  };

  P.kineticEnergy = function (mass, speed) {
    return 0.5 * mass * speed * speed;
  };

  P.momentum = function (mass, velocity) {
    return mass * velocity;
  };

  P.impulse = function (force, duration) {
    return force * duration;
  };

  P.centripetalAcceleration = function (speed, radius) {
    return speed * speed / radius;
  };

  P.curvatureDrop = function (horizontalDistance, radius) {
    var r = finiteOr(radius, K.earth.meanRadius);
    if (Math.abs(horizontalDistance) >= r) {
      return r;
    }
    return r - Math.sqrt(r * r - horizontalDistance * horizontalDistance);
  };

  P.orbitalRadius = function (altitude, body) {
    return bodyRadius(body) + altitude;
  };

  P.altitudeFromRadius = function (radius, body) {
    return radius - bodyRadius(body);
  };

  P.circularVelocityAtRadius = function (radius, body) {
    return Math.sqrt(bodyMu(body) / radius);
  };

  P.circularVelocity = function (altitude, body) {
    return P.circularVelocityAtRadius(P.orbitalRadius(altitude, body), body);
  };

  P.escapeVelocityAtRadius = function (radius, body) {
    return Math.sqrt(2 * bodyMu(body) / radius);
  };

  P.escapeVelocity = function (altitude, body) {
    return P.escapeVelocityAtRadius(P.orbitalRadius(altitude, body), body);
  };

  P.orbitalPeriodAtRadius = function (radius, body) {
    return K.TWO_PI * Math.sqrt(radius * radius * radius / bodyMu(body));
  };

  P.orbitalPeriod = function (altitude, body) {
    return P.orbitalPeriodAtRadius(P.orbitalRadius(altitude, body), body);
  };

  P.radiusForPeriod = function (period, body) {
    return Math.pow(bodyMu(body) * period * period / (K.TWO_PI * K.TWO_PI), 1 / 3);
  };

  P.altitudeForPeriod = function (period, body) {
    return P.radiusForPeriod(period, body) - bodyRadius(body);
  };

  P.meanMotion = function (semiMajorAxis, body) {
    return Math.sqrt(bodyMu(body) / Math.pow(semiMajorAxis, 3));
  };

  P.specificOrbitalEnergy = function (semiMajorAxis, body) {
    return -bodyMu(body) / (2 * semiMajorAxis);
  };

  P.visViva = function (radius, semiMajorAxis, body) {
    return Math.sqrt(bodyMu(body) * (2 / radius - 1 / semiMajorAxis));
  };

  P.circularOrbit = function (altitude, body) {
    var radius = P.orbitalRadius(altitude, body);
    var speed = P.circularVelocityAtRadius(radius, body);
    return {
      altitude: altitude,
      radius: radius,
      speed: speed,
      period: P.orbitalPeriodAtRadius(radius, body),
      angularVelocity: speed / radius,
      gravity: P.gravityAtRadius(radius, body),
      escapeSpeed: P.escapeVelocityAtRadius(radius, body),
      specificEnergy: P.specificOrbitalEnergy(radius, body)
    };
  };

  P.orbitFromApsides = function (periapsisRadius, apoapsisRadius, body) {
    var semiMajorAxis = (periapsisRadius + apoapsisRadius) / 2;
    var eccentricity = (apoapsisRadius - periapsisRadius) /
      (apoapsisRadius + periapsisRadius);
    return {
      periapsisRadius: periapsisRadius,
      apoapsisRadius: apoapsisRadius,
      periapsisAltitude: P.altitudeFromRadius(periapsisRadius, body),
      apoapsisAltitude: P.altitudeFromRadius(apoapsisRadius, body),
      semiMajorAxis: semiMajorAxis,
      eccentricity: eccentricity,
      period: P.orbitalPeriodAtRadius(semiMajorAxis, body),
      periapsisSpeed: P.visViva(periapsisRadius, semiMajorAxis, body),
      apoapsisSpeed: P.visViva(apoapsisRadius, semiMajorAxis, body),
      specificEnergy: P.specificOrbitalEnergy(semiMajorAxis, body)
    };
  };

  P.apsidesFromElements = function (semiMajorAxis, eccentricity, body) {
    return P.orbitFromApsides(
      semiMajorAxis * (1 - eccentricity),
      semiMajorAxis * (1 + eccentricity),
      body
    );
  };

  P.radiusAtTrueAnomaly = function (semiMajorAxis, eccentricity, trueAnomaly) {
    return semiMajorAxis * (1 - eccentricity * eccentricity) /
      (1 + eccentricity * Math.cos(trueAnomaly));
  };

  P.speedAtTrueAnomaly = function (semiMajorAxis, eccentricity, trueAnomaly, body) {
    return P.visViva(
      P.radiusAtTrueAnomaly(semiMajorAxis, eccentricity, trueAnomaly),
      semiMajorAxis,
      body
    );
  };

  P.solveKepler = function (meanAnomaly, eccentricity) {
    var mean = normalizeAngle(meanAnomaly);
    var eccentric = eccentricity < 0.8 ? mean : K.PI;
    var i;
    var delta;
    for (i = 0; i < K.numeric.solverIterations; i += 1) {
      delta = (eccentric - eccentricity * Math.sin(eccentric) - mean) /
        (1 - eccentricity * Math.cos(eccentric));
      eccentric -= delta;
      if (Math.abs(delta) < K.numeric.epsilon) {
        break;
      }
    }
    return eccentric;
  };

  P.trueAnomalyFromEccentric = function (eccentricAnomaly, eccentricity) {
    return normalizeAngle(2 * Math.atan2(
      Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomaly / 2),
      Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomaly / 2)
    ));
  };

  P.keplerState = function (semiMajorAxis, eccentricity, elapsedTime, meanAnomalyAtEpoch, body) {
    var mean = finiteOr(meanAnomalyAtEpoch, 0) +
      P.meanMotion(semiMajorAxis, body) * elapsedTime;
    var eccentric = P.solveKepler(mean, eccentricity);
    var trueAnomaly = P.trueAnomalyFromEccentric(eccentric, eccentricity);
    var radius = semiMajorAxis * (1 - eccentricity * Math.cos(eccentric));
    return {
      meanAnomaly: normalizeAngle(mean),
      eccentricAnomaly: eccentric,
      trueAnomaly: trueAnomaly,
      radius: radius,
      altitude: P.altitudeFromRadius(radius, body),
      speed: P.visViva(radius, semiMajorAxis, body)
    };
  };

  P.hohmannTransfer = function (radiusFrom, radiusTo, body) {
    var mu = bodyMu(body);
    var transferAxis = (radiusFrom + radiusTo) / 2;
    var circularFrom = Math.sqrt(mu / radiusFrom);
    var circularTo = Math.sqrt(mu / radiusTo);
    var transferFrom = Math.sqrt(mu * (2 / radiusFrom - 1 / transferAxis));
    var transferTo = Math.sqrt(mu * (2 / radiusTo - 1 / transferAxis));
    var burn1 = transferFrom - circularFrom;
    var burn2 = circularTo - transferTo;
    return {
      radiusFrom: radiusFrom,
      radiusTo: radiusTo,
      semiMajorAxis: transferAxis,
      circularSpeedFrom: circularFrom,
      circularSpeedTo: circularTo,
      transferSpeedFrom: transferFrom,
      transferSpeedTo: transferTo,
      deltaV1: burn1,
      deltaV2: burn2,
      totalDeltaV: Math.abs(burn1) + Math.abs(burn2),
      transferTime: K.PI * Math.sqrt(
        Math.pow(transferAxis, 3) / mu
      )
    };
  };

  P.hohmannTransferByAltitude = function (altitudeFrom, altitudeTo, body) {
    return P.hohmannTransfer(
      P.orbitalRadius(altitudeFrom, body),
      P.orbitalRadius(altitudeTo, body),
      body
    );
  };

  P.biEllipticTransfer = function (radiusFrom, radiusTo, intermediateRadius, body) {
    var mu = bodyMu(body);
    var firstAxis = (radiusFrom + intermediateRadius) / 2;
    var secondAxis = (radiusTo + intermediateRadius) / 2;
    var circularFrom = Math.sqrt(mu / radiusFrom);
    var circularTo = Math.sqrt(mu / radiusTo);
    var firstAtStart = Math.sqrt(mu * (2 / radiusFrom - 1 / firstAxis));
    var firstAtHigh = Math.sqrt(mu * (2 / intermediateRadius - 1 / firstAxis));
    var secondAtHigh = Math.sqrt(mu * (2 / intermediateRadius - 1 / secondAxis));
    var secondAtEnd = Math.sqrt(mu * (2 / radiusTo - 1 / secondAxis));
    var burn1 = firstAtStart - circularFrom;
    var burn2 = secondAtHigh - firstAtHigh;
    var burn3 = circularTo - secondAtEnd;
    return {
      deltaV1: burn1,
      deltaV2: burn2,
      deltaV3: burn3,
      totalDeltaV: Math.abs(burn1) + Math.abs(burn2) + Math.abs(burn3),
      transferTime: K.PI * (
        Math.sqrt(Math.pow(firstAxis, 3) / mu) +
        Math.sqrt(Math.pow(secondAxis, 3) / mu)
      )
    };
  };

  P.planeChangeDeltaV = function (speed, angleRadians) {
    return 2 * speed * Math.sin(Math.abs(angleRadians) / 2);
  };

  P.planeChangeDeltaVDegrees = function (speed, angleDegrees) {
    return P.planeChangeDeltaV(speed, P.toRadians(angleDegrees));
  };

  P.combinedBurnDeltaV = function (speedBefore, speedAfter, turnAngle) {
    return Math.sqrt(
      speedBefore * speedBefore +
      speedAfter * speedAfter -
      2 * speedBefore * speedAfter * Math.cos(turnAngle)
    );
  };

  P.relativeVelocity = function (speedA, speedB, angle) {
    return P.combinedBurnDeltaV(speedA, speedB, angle);
  };

  P.transferPhaseAngle = function (radiusFrom, radiusTo, body) {
    var transfer = P.hohmannTransfer(radiusFrom, radiusTo, body);
    var targetMotion = P.meanMotion(radiusTo, body) * transfer.transferTime;
    return normalizeAngle(K.PI - targetMotion);
  };

  P.synodicPeriod = function (periodA, periodB) {
    return 1 / Math.abs(1 / periodA - 1 / periodB);
  };

  P.hyperbolicDeparture = function (parkingRadius, hyperbolicExcessSpeed, body) {
    var circular = P.circularVelocityAtRadius(parkingRadius, body);
    var escape = P.escapeVelocityAtRadius(parkingRadius, body);
    var burnSpeed = Math.sqrt(
      escape * escape + hyperbolicExcessSpeed * hyperbolicExcessSpeed
    );
    return {
      circularSpeed: circular,
      escapeSpeed: escape,
      burnSpeed: burnSpeed,
      deltaV: burnSpeed - circular,
      c3: hyperbolicExcessSpeed * hyperbolicExcessSpeed
    };
  };

  P.sphereOfInfluence = function (semiMajorAxis, orbitingMass, centralMass) {
    return semiMajorAxis * Math.pow(orbitingMass / centralMass, 2 / 5);
  };

  P.hillRadius = function (semiMajorAxis, eccentricity, orbitingMass, centralMass) {
    return semiMajorAxis * (1 - eccentricity) *
      Math.pow(orbitingMass / (3 * centralMass), 1 / 3);
  };

  P.geostationaryOrbit = function () {
    var radius = P.radiusForPeriod(K.earth.siderealDay, K.earth);
    return {
      radius: radius,
      altitude: radius - K.earth.equatorialRadius,
      speed: P.circularVelocityAtRadius(radius, K.earth),
      period: K.earth.siderealDay
    };
  };

  P.nodalPrecessionRate = function (semiMajorAxis, eccentricity, inclination, body) {
    var selected = bodyOrEarth(body);
    var radius = bodyRadius(selected);
    var j2 = finiteOr(selected.J2, K.earth.J2);
    var meanMotion = P.meanMotion(semiMajorAxis, selected);
    return -1.5 * j2 * meanMotion *
      Math.pow(radius / (semiMajorAxis * (1 - eccentricity * eccentricity)), 2) *
      Math.cos(inclination);
  };

  P.sunSynchronousInclination = function (altitude, eccentricity) {
    var semiMajorAxis = P.orbitalRadius(altitude, K.earth);
    var e = finiteOr(eccentricity, 0);
    var targetRate = K.TWO_PI / K.time.tropicalYear;
    var factor = 1.5 * K.earth.J2 *
      P.meanMotion(semiMajorAxis, K.earth) *
      Math.pow(
        K.earth.meanRadius /
          (semiMajorAxis * (1 - e * e)),
        2
      );
    var cosine = P.clamp(-targetRate / factor, -1, 1);
    return Math.acos(cosine);
  };

  P.groundTrackShiftPerOrbit = function (period, body) {
    var selected = bodyOrEarth(body);
    var rotation = finiteOr(selected.rotationRate, K.earth.rotationRate);
    return normalizeAngle(rotation * period);
  };

  P.surfaceRotationSpeed = function (latitude, body) {
    var selected = bodyOrEarth(body);
    var omega = finiteOr(selected.rotationRate, K.earth.rotationRate);
    return omega * bodyRadius(selected) * Math.cos(latitude);
  };

  P.minimumLaunchInclination = function (latitude) {
    return Math.abs(latitude);
  };

  P.launchInclination = function (latitude, azimuth) {
    return Math.acos(
      P.clamp(Math.cos(latitude) * Math.sin(azimuth), -1, 1)
    );
  };

  P.launchAzimuths = function (latitude, targetInclination) {
    var denominator = Math.cos(latitude);
    var ratio;
    var first;
    if (Math.abs(denominator) < K.numeric.epsilon) {
      return [];
    }
    ratio = Math.cos(targetInclination) / denominator;
    if (Math.abs(ratio) > 1) {
      return [];
    }
    first = Math.asin(ratio);
    return [normalizeAngle(first), normalizeAngle(K.PI - first)];
  };

  P.rotationAssist = function (latitude, azimuth, body) {
    return P.surfaceRotationSpeed(latitude, body) * Math.sin(azimuth);
  };

  P.inertialLaunchSpeed = function (relativeSpeed, latitude, azimuth, body) {
    var east = P.surfaceRotationSpeed(latitude, body);
    return Math.sqrt(
      relativeSpeed * relativeSpeed +
      east * east +
      2 * relativeSpeed * east * Math.sin(azimuth)
    );
  };

  P.surfaceToCircularSpecificEnergy = function (altitude, latitude, body) {
    var selected = bodyOrEarth(body);
    var radius = bodyRadius(selected);
    var orbitRadius = radius + altitude;
    var rotationSpeed = P.surfaceRotationSpeed(finiteOr(latitude, 0), selected);
    return bodyMu(selected) / radius -
      bodyMu(selected) / (2 * orbitRadius) -
      rotationSpeed * rotationSpeed / 2;
  };

  P.horizon = function (altitude, body) {
    var radius = bodyRadius(body);
    var orbitalRadius = radius + altitude;
    var centralAngle = Math.acos(radius / orbitalRadius);
    return {
      lineOfSightDistance: Math.sqrt(
        orbitalRadius * orbitalRadius - radius * radius
      ),
      groundArcDistance: radius * centralAngle,
      centralAngle: centralAngle,
      coverageFraction: (1 - Math.cos(centralAngle)) / 2
    };
  };

  P.lightTime = function (distance, roundTrip) {
    return distance / K.c * (roundTrip ? 2 : 1);
  };

  P.effectiveExhaustVelocity = function (specificImpulse) {
    return specificImpulse * K.g0;
  };

  P.specificImpulse = function (exhaustVelocity) {
    return exhaustVelocity / K.g0;
  };

  P.rocketDeltaV = function (specificImpulse, initialMass, finalMass) {
    return P.effectiveExhaustVelocity(specificImpulse) *
      Math.log(initialMass / finalMass);
  };

  P.rocketEquation = P.rocketDeltaV;

  P.rocketDeltaVFromExhaustVelocity = function (exhaustVelocity, initialMass, finalMass) {
    return exhaustVelocity * Math.log(initialMass / finalMass);
  };

  P.massRatioForDeltaV = function (deltaV, specificImpulse) {
    return Math.exp(deltaV / P.effectiveExhaustVelocity(specificImpulse));
  };

  P.propellantFractionForDeltaV = function (deltaV, specificImpulse) {
    return 1 - 1 / P.massRatioForDeltaV(deltaV, specificImpulse);
  };

  P.initialMassForDeltaV = function (finalMass, deltaV, specificImpulse) {
    return finalMass * P.massRatioForDeltaV(deltaV, specificImpulse);
  };

  P.propellantMassForDeltaV = function (finalMass, deltaV, specificImpulse) {
    return P.initialMassForDeltaV(finalMass, deltaV, specificImpulse) - finalMass;
  };

  P.finalMassAfterBurn = function (initialMass, deltaV, specificImpulse) {
    return initialMass / P.massRatioForDeltaV(deltaV, specificImpulse);
  };

  P.massFlow = function (thrust, specificImpulse) {
    return thrust / P.effectiveExhaustVelocity(specificImpulse);
  };

  P.thrustFromMassFlow = function (massFlow, specificImpulse) {
    return massFlow * P.effectiveExhaustVelocity(specificImpulse);
  };

  P.nozzleThrust = function (massFlow, exhaustVelocity, exitPressure, ambientPressure, exitArea) {
    return massFlow * exhaustVelocity +
      (exitPressure - ambientPressure) * exitArea;
  };

  P.burnTime = function (propellantMass, massFlow) {
    return propellantMass / massFlow;
  };

  P.thrustToWeight = function (thrust, mass, gravity) {
    return thrust / (mass * finiteOr(gravity, K.g0));
  };

  P.netVerticalAcceleration = function (thrust, mass, gravity) {
    return thrust / mass - finiteOr(gravity, K.g0);
  };

  P.powerLimitedThrust = function (power, exhaustVelocity, efficiency) {
    return 2 * finiteOr(efficiency, 1) * power / exhaustVelocity;
  };

  P.stageDeltaV = function (wetMass, dryMass, carriedMass, specificImpulse) {
    var payload = finiteOr(carriedMass, 0);
    return P.rocketDeltaV(
      specificImpulse,
      wetMass + payload,
      dryMass + payload
    );
  };

  P.multiStageDeltaV = function (stages, payloadMass) {
    var details = [];
    var total = 0;
    var i;
    var j;
    var carried;
    var initial;
    var final;
    var deltaV;
    for (i = 0; i < stages.length; i += 1) {
      carried = finiteOr(payloadMass, 0);
      for (j = i + 1; j < stages.length; j += 1) {
        carried += stages[j].wetMass;
      }
      initial = carried + stages[i].wetMass;
      final = carried + stages[i].dryMass;
      deltaV = P.rocketDeltaV(stages[i].isp, initial, final);
      total += deltaV;
      details.push({
        index: i,
        initialMass: initial,
        burnoutMass: final,
        carriedMass: carried,
        propellantMass: stages[i].wetMass - stages[i].dryMass,
        massRatio: initial / final,
        deltaV: deltaV,
        burnTime: isNumber(stages[i].thrust) ?
          P.burnTime(
            stages[i].wetMass - stages[i].dryMass,
            P.massFlow(stages[i].thrust, stages[i].isp)
          ) :
          NaN
      });
    }
    return {
      payloadMass: finiteOr(payloadMass, 0),
      totalDeltaV: total,
      stages: details
    };
  };

  P.payloadForDeltaV = function (stages, targetDeltaV) {
    var zeroPayload = P.multiStageDeltaV(stages, 0).totalDeltaV;
    var low = 0;
    var high = 0;
    var i;
    var mid;
    if (zeroPayload < targetDeltaV) {
      return NaN;
    }
    for (i = 0; i < stages.length; i += 1) {
      high += stages[i].wetMass;
    }
    if (high <= 0) {
      high = 1;
    }
    for (i = 0; i < K.numeric.solverIterations; i += 1) {
      if (P.multiStageDeltaV(stages, high).totalDeltaV <= targetDeltaV) {
        break;
      }
      high *= 2;
    }
    for (i = 0; i < K.numeric.solverIterations; i += 1) {
      mid = (low + high) / 2;
      if (P.multiStageDeltaV(stages, mid).totalDeltaV > targetDeltaV) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return (low + high) / 2;
  };

  P.deltaVBudget = function (components) {
    var total = 0;
    var key;
    var i;
    if (Object.prototype.toString.call(components) === "[object Array]") {
      return P.sum(components);
    }
    for (key in components) {
      if (Object.prototype.hasOwnProperty.call(components, key)) {
        total += finiteOr(components[key], 0);
      }
    }
    return total;
  };

  P.gravityLoss = function (gravity, duration, meanFlightPathAngle) {
    return gravity * duration *
      Math.sin(finiteOr(meanFlightPathAngle, K.HALF_PI));
  };

  P.constantGravityPeakAltitude = function (launchSpeed, gravity) {
    var g = finiteOr(gravity, K.g0);
    return launchSpeed * launchSpeed / (2 * g);
  };

  P.constantGravityCoastTime = function (launchSpeed, gravity) {
    return launchSpeed / finiteOr(gravity, K.g0);
  };

  P.verticalBallisticPeakAltitude = function (launchSpeed, body) {
    var radius = bodyRadius(body);
    var mu = bodyMu(body);
    var inversePeakRadius = 1 / radius - launchSpeed * launchSpeed / (2 * mu);
    if (inversePeakRadius <= 0) {
      return Infinity;
    }
    return 1 / inversePeakRadius - radius;
  };

  P.isaAtmosphere = function (altitude) {
    var h = altitude;
    var layers = K.atmosphere.layers;
    var layer = layers[0];
    var i;
    var delta;
    var temperature;
    var pressure;
    for (i = 0; i < layers.length; i += 1) {
      if (h >= layers[i].altitude) {
        layer = layers[i];
      } else {
        break;
      }
    }
    delta = h - layer.altitude;
    temperature = layer.temperature + layer.lapse * delta;
    if (layer.lapse === 0) {
      pressure = layer.pressure * Math.exp(
        -K.g0 * delta /
          (K.atmosphere.specificGasConstant * layer.temperature)
      );
    } else {
      pressure = layer.pressure * Math.pow(
        temperature / layer.temperature,
        -K.g0 /
          (layer.lapse * K.atmosphere.specificGasConstant)
      );
    }
    return {
      altitude: altitude,
      temperature: temperature,
      pressure: pressure,
      density: pressure /
        (K.atmosphere.specificGasConstant * temperature),
      soundSpeed: Math.sqrt(
        K.atmosphere.heatCapacityRatio *
        K.atmosphere.specificGasConstant *
        temperature
      )
    };
  };

  P.upperAtmosphericDensity = function (altitude) {
    var table = K.atmosphere.upperDensity;
    var lower = table[0];
    var upper = table[table.length - 1];
    var i;
    var fraction;
    var logarithm;
    if (altitude <= table[0].altitude) {
      return table[0].density;
    }
    for (i = 1; i < table.length; i += 1) {
      if (altitude <= table[i].altitude) {
        lower = table[i - 1];
        upper = table[i];
        break;
      }
    }
    if (altitude > table[table.length - 1].altitude) {
      lower = table[table.length - 2];
      upper = table[table.length - 1];
    }
    fraction = (altitude - lower.altitude) /
      (upper.altitude - lower.altitude);
    logarithm = Math.log(lower.density) +
      fraction * (Math.log(upper.density) - Math.log(lower.density));
    return Math.exp(logarithm);
  };

  P.atmosphericDensity = function (altitude) {
    if (altitude <= K.atmosphere.maxIsaAltitude) {
      return P.isaAtmosphere(altitude).density;
    }
    return P.upperAtmosphericDensity(altitude);
  };

  P.standardAtmosphere = function (altitude) {
    var result;
    var density;
    var temperature;
    if (altitude <= K.atmosphere.maxIsaAltitude) {
      return P.isaAtmosphere(altitude);
    }
    density = P.upperAtmosphericDensity(altitude);
    temperature = K.atmosphere.thermosphereTemperature;
    result = {
      altitude: altitude,
      temperature: temperature,
      pressure: density * K.atmosphere.specificGasConstant * temperature,
      density: density,
      soundSpeed: Math.sqrt(
        K.atmosphere.heatCapacityRatio *
        K.atmosphere.specificGasConstant *
        temperature
      )
    };
    return result;
  };

  P.speedOfSound = function (temperature) {
    return Math.sqrt(
      K.atmosphere.heatCapacityRatio *
      K.atmosphere.specificGasConstant *
      temperature
    );
  };

  P.machNumber = function (speed, temperatureOrSoundSpeed, isSoundSpeed) {
    var soundSpeed = isSoundSpeed ?
      temperatureOrSoundSpeed :
      P.speedOfSound(temperatureOrSoundSpeed);
    return speed / soundSpeed;
  };

  P.dynamicPressure = function (density, speed) {
    return 0.5 * density * speed * speed;
  };

  P.dragForce = function (density, speed, dragCoefficient, area) {
    return P.dynamicPressure(density, speed) * dragCoefficient * area;
  };

  P.dragAcceleration = function (density, speed, dragCoefficient, area, mass) {
    return P.dragForce(density, speed, dragCoefficient, area) / mass;
  };

  P.ballisticCoefficient = function (mass, dragCoefficient, area) {
    return mass / (dragCoefficient * area);
  };

  P.terminalVelocity = function (mass, gravity, density, dragCoefficient, area) {
    return Math.sqrt(
      2 * mass * gravity / (density * dragCoefficient * area)
    );
  };

  P.orbitDecayRate = function (altitude, mass, dragCoefficient, area, body) {
    var radius = P.orbitalRadius(altitude, body);
    var mu = bodyMu(body);
    var speed = P.circularVelocityAtRadius(radius, body);
    var density = P.atmosphericDensity(altitude);
    var drag = P.dragForce(density, speed, dragCoefficient, area);
    return -2 * radius * radius * drag * speed / (mass * mu);
  };

  P.orbitDecayTime = function (altitudeFrom, altitudeTo, mass, dragCoefficient, area, body, steps) {
    var count = Math.max(
      1,
      Math.floor(finiteOr(steps, K.numeric.integrationSteps))
    );
    var high = Math.max(altitudeFrom, altitudeTo);
    var low = Math.min(altitudeFrom, altitudeTo);
    var interval = (high - low) / count;
    var total = 0;
    var i;
    var altitude;
    var rate;
    for (i = 0; i < count; i += 1) {
      altitude = high - (i + 0.5) * interval;
      rate = Math.abs(
        P.orbitDecayRate(
          altitude,
          mass,
          dragCoefficient,
          area,
          body
        )
      );
      if (rate <= 0) {
        return Infinity;
      }
      total += interval / rate;
    }
    return total;
  };

  P.reentryHeatingRate = function (density, speed, noseRadius) {
    return K.reentry.suttonGravesCoefficient *
      Math.sqrt(density / noseRadius) *
      Math.pow(speed, 3);
  };

  P.power = function (energy, duration) {
    return energy / duration;
  };

  P.energyPerUnitMassToCircularOrbit = function (altitude, latitude, body) {
    return P.surfaceToCircularSpecificEnergy(altitude, latitude, body);
  };

  P.fuelEnergyEquivalent = function (energy, specificEnergy, efficiency) {
    return energy / (specificEnergy * finiteOr(efficiency, 1));
  };

  var pendingConfig = null;
  var readyBound = false;

  function renderMount(cfg) {
    var doc = global.document;
    var body;
    var index;
    var header;
    var footer;
    var meta;
    var progress;
    var topic;
    var i;
    var item;

    if (!doc || !doc.body) {
      return null;
    }

    body = doc.body;
    index = Math.round(finiteOr(cfg.index, 1));
    index = P.clamp(index, 1, K.pageCount);

    header = doc.getElementById("lec-header");
    if (!header) {
      header = doc.createElement("header");
      header.id = "lec-header";
      if (body.firstChild) {
        body.insertBefore(header, body.firstChild);
      } else {
        body.appendChild(header);
      }
    }

    clearNode(header);
    header.className = "lec-header page-header";
    header.setAttribute("data-lec-header", "");
    header.setAttribute("data-page-index", String(index));

    meta = doc.createElement("div");
    meta.className = "lec-header__meta page-header__meta";
    header.appendChild(meta);

    appendTextElement(
      doc,
      meta,
      "span",
      "lec-header__kicker page-header__kicker",
      cfg.kicker || K.ui.topic
    );

    appendTextElement(
      doc,
      meta,
      "span",
      "lec-header__page page-header__page",
      P.pageLabel(index)
    );

    appendTextElement(
      doc,
      header,
      "h1",
      "lec-header__title page-header__title",
      cfg.title || K.ui.topic
    );

    if (cfg.take) {
      appendTextElement(
        doc,
        header,
        "p",
        "lec-header__take page-header__take",
        cfg.take
      );
    }

    footer = doc.getElementById("lec-footer");
    if (!footer) {
      footer = doc.createElement("footer");
      footer.id = "lec-footer";
      body.appendChild(footer);
    } else if (footer.parentNode === body && footer !== body.lastChild) {
      body.appendChild(footer);
    }

    clearNode(footer);
    footer.className = "lec-footer page-footer";
    footer.setAttribute("data-lec-footer", "");
    footer.setAttribute("data-page-index", String(index));

    topic = doc.createElement("div");
    topic.className = "lec-footer__topic page-footer__topic";
    topic.appendChild(doc.createTextNode(
      K.ui.topic + K.ui.titleSeparator + K.ui.subtitle
    ));
    footer.appendChild(topic);

    progress = doc.createElement("div");
    progress.className = "lec-progress page-footer__progress";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "1");
    progress.setAttribute("aria-valuemax", String(K.pageCount));
    progress.setAttribute("aria-valuenow", String(index));
    progress.setAttribute("aria-label", P.pageLabel(index));

    for (i = 1; i <= K.pageCount; i += 1) {
      item = doc.createElement("span");
      item.className = "lec-progress__item" +
        (i === index ? " is-current" : "") +
        (i < index ? " is-complete" : "");
      item.setAttribute("aria-hidden", "true");
      item.setAttribute("data-page", String(i));
      progress.appendChild(item);
    }

    footer.appendChild(progress);

    appendTextElement(
      doc,
      footer,
      "div",
      "lec-footer__page page-footer__page",
      P.pageLabel(index)
    );

    body.setAttribute("data-lec-index", String(index));
    body.setAttribute("data-lec-pages", String(K.pageCount));

    if (cfg.title) {
      doc.title = cfg.title + K.ui.titleSeparator + K.ui.topic;
    }

    return {
      header: header,
      footer: footer,
      index: index,
      config: cfg
    };
  }

  function onReady() {
    readyBound = false;
    if (pendingConfig) {
      renderMount(pendingConfig);
      pendingConfig = null;
    }
  }

  function mount(cfg) {
    var doc = global.document;
    cfg = cfg || {};

    if (!doc) {
      return null;
    }

    if (doc.body) {
      return renderMount(cfg);
    }

    pendingConfig = cfg;

    if (!readyBound) {
      readyBound = true;
      if (doc.addEventListener) {
        doc.addEventListener("DOMContentLoaded", onReady, false);
      } else if (doc.attachEvent) {
        doc.attachEvent("onreadystatechange", function () {
          if (doc.readyState === "complete") {
            onReady();
          }
        });
      }
    }

    return null;
  }

  global.Lec = {
    K: K,
    P: P,
    mount: mount
  };
}(this));