(function (global) {
  'use strict';

  // ============================================================
  // Lec.K —— 常量
  // ============================================================
  var K = {

    VERSION: '1.0.0',
    TOTAL_PAGES: 20,
    SERIES_TITLE: '火箭与轨道:怎么把东西送上太空,并让它待在那儿',

    // ---- 基本物理常量 ----
    G: 6.6743e-11,        // 万有引力常量 m^3 kg^-1 s^-2
    g0: 9.80665,          // 标准重力加速度 m/s^2 (用于比冲换算)

    // ---- 时间 ----
    DAY: 86400,           // 太阳日 s
    HOUR: 3600,
    MIN: 60,

    // ---- 距离 ----
    AU: 1.495978707e11,   // 天文单位 m
    KM: 1000,

    // ---- 天体数据 ----
    // mu(标准引力参数)采用观测精度更高的公开值,不强行等于 G*mass,
    // 这与真实测量情况一致(mu 往往比 G、mass 单独测得的更精确)。
    bodies: {
      earth: {
        name: '地球',
        mass: 5.972e24,        // kg
        radius: 6371000,       // m (平均半径)
        mu: 3.986004418e14,    // m^3/s^2
        siderealDay: 86164.0905, // s (地球恒星日,用于同步轨道计算)
        gSurface: 9.80665,
        orbitRadius: 1.495978707e11 // 绕日轨道半径(近似取 1 AU,近圆)
      },
      moon: {
        name: '月球',
        mass: 7.342e22,
        radius: 1737400,
        mu: 4.9048695e12
      },
      mars: {
        name: '火星',
        mass: 6.4171e23,
        radius: 3389500,
        mu: 4.282837e13
      },
      sun: {
        name: '太阳',
        mass: 1.98892e30,
        radius: 6.957e8,
        mu: 1.32712440018e20
      }
    },

    // ---- 大气(简化指数模型,仅用于教学示例) ----
    atmosphere: {
      rho0: 1.225,        // kg/m^3, 海平面空气密度
      H: 8500,            // m, 标高
      seaLevelPressure: 101325 // Pa
    },

    // ---- 典型比冲参考值(s) ----
    isp: {
      solidBooster: 250,
      kerosene_sl: 282,
      kerosene_vac: 311,
      hydrolox_vac: 450,
      hypergolic: 320,
      ionThruster: 3000
    },

    // ---- 全套讲义统一使用的"示例火箭"(玩具模型,保证各页数字一致) ----
    example: {
      m0: 100000,       // kg, 初始(湿)质量
      mf: 20000,         // kg, 末端(干)质量
      isp: 300,           // s
      thrust: 2000000     // N
    },

    // ---- 真实运载火箭参考数据(近似公开数据,用于对比讲解) ----
    vehicles: {
      saturnV: {
        name: 'Saturn V',
        payload: 45000, // kg, 送往地月转移轨道的载荷(阿波罗飞船组合体近似值)
        stages: [
          { name: 'S-IC(一级)', propellantMass: 2160000, dryMass: 130000, isp: 263, thrust: 34500000 },
          { name: 'S-II(二级)', propellantMass: 440000, dryMass: 40000, isp: 421, thrust: 5141000 },
          { name: 'S-IVB(三级)', propellantMass: 106000, dryMass: 13300, isp: 421, thrust: 1033000 }
        ]
      },
      falcon9: {
        name: 'Falcon 9(一次性构型)',
        payload: 22800, // kg, 近地轨道运力近似值
        stages: [
          { name: '一级(9×Merlin 1D)', propellantMass: 395700, dryMass: 25600, isp: 282, thrust: 7607000 },
          { name: '二级(1×Merlin 1D Vac)', propellantMass: 92670, dryMass: 4000, isp: 348, thrust: 981000 }
        ]
      }
    },

    // ---- 参考轨道高度(m),仅作教学范围提示,精确值一律由 P 计算 ----
    leo: { altMin: 200000, altMax: 2000000 }
  };

  // ============================================================
  // Lec.P —— 算法与公式(唯一计算来源,页面不写死数字)
  // ============================================================
  var P = {};

  // ---------- 工具:角度/格式化 ----------
  P.deg2rad = function (deg) { return deg * Math.PI / 180; };
  P.rad2deg = function (rad) { return rad * 180 / Math.PI; };

  P.round = function (v, digits) {
    var d = (typeof digits === 'number') ? digits : 0;
    var m = Math.pow(10, d);
    return Math.round(v * m) / m;
  };

  P.fmt = function (v, digits) {
    var d = (typeof digits === 'number') ? digits : 2;
    var n = P.round(v, d);
    var s = n.toFixed(d);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  };

  P.fmtSci = function (v, digits) {
    var d = (typeof digits === 'number') ? digits : 3;
    if (v === 0) { return '0'; }
    var exp = Math.floor(Math.log(Math.abs(v)) / Math.LN10);
    var mant = v / Math.pow(10, exp);
    return mant.toFixed(d) + '×10^' + exp;
  };

  // ---------- 单位换算 ----------
  P.kmToM = function (km) { return km * 1000; };
  P.mToKm = function (m) { return m / 1000; };
  P.mpsToKmph = function (v) { return v * 3.6; };
  P.kmphToMps = function (v) { return v / 3.6; };
  P.mpsToKmps = function (v) { return v / 1000; };
  P.kmpsToMps = function (v) { return v * 1000; };
  P.secToMin = function (s) { return s / K.MIN; };
  P.secToHour = function (s) { return s / K.HOUR; };
  P.secToDay = function (s) { return s / K.DAY; };

  // ---------- 基础引力 ----------
  P.muOf = function (mass) { return K.G * mass; };
  P.gravityAt = function (mu, r) { return mu / (r * r); };
  P.surfaceGravity = function (mass, radius) { return K.G * mass / (radius * radius); };
  P.altitudeToRadius = function (bodyRadius, altitude) { return bodyRadius + altitude; };
  P.radiusToAltitude = function (bodyRadius, radius) { return radius - bodyRadius; };
  P.centripetalAcceleration = function (v, r) { return (v * v) / r; };

  // ---------- 圆轨道 / 椭圆轨道基本量 ----------
  P.circularVelocity = function (mu, r) { return Math.sqrt(mu / r); };
  P.circularPeriod = function (mu, r) { return 2 * Math.PI * Math.sqrt((r * r * r) / mu); };
  P.escapeVelocity = function (mu, r) { return Math.sqrt(2 * mu / r); };
  P.visViva = function (mu, r, a) { return Math.sqrt(mu * (2 / r - 1 / a)); };

  P.semiMajorAxis = function (rp, ra) { return (rp + ra) / 2; };
  P.eccentricity = function (rp, ra) { return (ra - rp) / (ra + rp); };
  P.specificOrbitalEnergy = function (mu, a) { return -mu / (2 * a); };
  P.angularMomentum = function (mu, a, e) { return Math.sqrt(mu * a * (1 - e * e)); };

  P.periodFromSemiMajor = function (mu, a) { return P.circularPeriod(mu, a); };
  P.semiMajorFromPeriod = function (mu, T) {
    return Math.pow((mu * T * T) / (4 * Math.PI * Math.PI), 1 / 3);
  };

  P.geostationaryRadius = function (mu, siderealPeriod) { return P.semiMajorFromPeriod(mu, siderealPeriod); };
  P.geostationaryAltitude = function (mu, siderealPeriod, bodyRadius) {
    return P.geostationaryRadius(mu, siderealPeriod) - bodyRadius;
  };

  P.orbitalVelocityAtAltitude = function (body, altitude) {
    return P.circularVelocity(body.mu, P.altitudeToRadius(body.radius, altitude));
  };
  P.orbitalPeriodAtAltitude = function (body, altitude) {
    return P.circularPeriod(body.mu, P.altitudeToRadius(body.radius, altitude));
  };
  P.escapeVelocityAtAltitude = function (body, altitude) {
    return P.escapeVelocity(body.mu, P.altitudeToRadius(body.radius, altitude));
  };

  P.orbitalSpeedFromPeriod = function (r, T) { return (2 * Math.PI * r) / T; };
  P.synodicPeriod = function (T1, T2) { return 1 / Math.abs(1 / T1 - 1 / T2); };

  // ---------- 第一 / 第二 / 第三宇宙速度 ----------
  P.firstCosmicVelocity = function (body) { return P.circularVelocity(body.mu, body.radius); };
  P.secondCosmicVelocity = function (body) { return P.escapeVelocity(body.mu, body.radius); };

  P.earthOrbitalVelocity = function (sunMu, orbitRadius) { return Math.sqrt(sunMu / orbitRadius); };
  P.solarEscapeAtRadius = function (sunMu, r) { return Math.sqrt(2 * sunMu / r); };
  P.thirdCosmicVelocity = function (earthEscapeV2, sunMu, orbitRadius) {
    var vInfNeeded = P.solarEscapeAtRadius(sunMu, orbitRadius) - P.earthOrbitalVelocity(sunMu, orbitRadius);
    return Math.sqrt(earthEscapeV2 * earthEscapeV2 + vInfNeeded * vInfNeeded);
  };

  // ---------- 开普勒方程(用于轨道位置随时间变化的动画) ----------
  P.meanMotion = function (mu, a) { return Math.sqrt(mu / (a * a * a)); };

  P.eccentricAnomaly = function (M, e, tol, maxIter) {
    tol = tol || 1e-8;
    maxIter = maxIter || 50;
    var E = M;
    for (var i = 0; i < maxIter; i++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < tol) { break; }
    }
    return E;
  };

  P.trueAnomalyFromEccentric = function (E, e) {
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  };

  P.orbitRadiusAtTrueAnomaly = function (a, e, theta) {
    return a * (1 - e * e) / (1 + e * Math.cos(theta));
  };

  P.orbitXY = function (a, e, theta) {
    var r = P.orbitRadiusAtTrueAnomaly(a, e, theta);
    return { r: r, x: r * Math.cos(theta), y: r * Math.sin(theta) };
  };

  // t, t0: 秒;返回某时刻的真近点角、半径、平面坐标
  P.orbitalPosition = function (mu, a, e, t, t0) {
    t0 = t0 || 0;
    var n = P.meanMotion(mu, a);
    var M = n * (t - t0);
    M = M % (2 * Math.PI);
    var E = P.eccentricAnomaly(M, e);
    var theta = P.trueAnomalyFromEccentric(E, e);
    var pos = P.orbitXY(a, e, theta);
    return { M: M, E: E, theta: theta, r: pos.r, x: pos.x, y: pos.y };
  };

  // ---------- 霍曼转移 ----------
  P.hohmannTransfer = function (mu, r1, r2) {
    var at = P.semiMajorAxis(r1, r2);
    var v1 = P.circularVelocity(mu, r1);
    var v2 = P.circularVelocity(mu, r2);
    var vt1 = P.visViva(mu, r1, at);
    var vt2 = P.visViva(mu, r2, at);
    var dv1 = vt1 - v1;
    var dv2 = v2 - vt2;
    var transferTime = Math.PI * Math.sqrt((at * at * at) / mu);
    return {
      r1: r1, r2: r2, aTransfer: at,
      dv1: dv1, dv2: dv2, dvTotal: Math.abs(dv1) + Math.abs(dv2),
      transferTime: transferTime
    };
  };

  // ---------- 齐奥尔科夫斯基火箭方程 ----------
  P.exhaustVelocity = function (isp, g0) { g0 = g0 || K.g0; return isp * g0; };
  P.ispFromVe = function (ve, g0) { g0 = g0 || K.g0; return ve / g0; };

  P.deltaV = function (isp, m0, mf, g0) {
    g0 = g0 || K.g0;
    return isp * g0 * Math.log(m0 / mf);
  };

  P.deltaVFromMassRatio = function (isp, massRatio, g0) {
    g0 = g0 || K.g0;
    return isp * g0 * Math.log(massRatio);
  };

  P.massRatio = function (deltaVValue, isp, g0) {
    g0 = g0 || K.g0;
    return Math.exp(deltaVValue / (isp * g0));
  };

  P.finalMass = function (m0, deltaVValue, isp, g0) {
    g0 = g0 || K.g0;
    return m0 / Math.exp(deltaVValue / (isp * g0));
  };

  P.initialMass = function (mf, deltaVValue, isp, g0) {
    g0 = g0 || K.g0;
    return mf * Math.exp(deltaVValue / (isp * g0));
  };

  P.propellantMass = function (m0, mf) { return m0 - mf; };
  P.payloadFraction = function (payload, m0) { return payload / m0; };

  P.thrust = function (mdot, ve) { return mdot * ve; };
  P.massFlowRate = function (thrustValue, ve) { return thrustValue / ve; };
  P.burnTime = function (propMass, mdot) { return propMass / mdot; };
  P.twr = function (thrustValue, mass, g) { g = g || K.g0; return thrustValue / (mass * g); };

  // 单级 delta-v(stage: {m0, mf, isp} 或 {propellantMass, dryMass, isp, aboveMass})
  P.stageDeltaV = function (stage, g0) {
    g0 = g0 || K.g0;
    var m0, mf;
    if (typeof stage.m0 === 'number' && typeof stage.mf === 'number') {
      m0 = stage.m0; mf = stage.mf;
    } else {
      var above = stage.aboveMass || 0;
      m0 = stage.propellantMass + stage.dryMass + above;
      mf = stage.dryMass + above;
    }
    return stage.isp * g0 * Math.log(m0 / mf);
  };

  // 多级火箭总 delta-v。stages 按"先燃烧的在前"(由下到上)排列,
  // 每级形如 { propellantMass, dryMass, isp },payload 为顶部固定载荷质量。
  P.multiStageDeltaV = function (stages, payload, g0) {
    g0 = g0 || K.g0;
    payload = payload || 0;
    var n = stages.length;
    var total = 0;
    var details = [];
    for (var i = 0; i < n; i++) {
      var above = payload;
      for (var j = i + 1; j < n; j++) {
        above += stages[j].propellantMass + stages[j].dryMass;
      }
      var m0 = stages[i].propellantMass + stages[i].dryMass + above;
      var mf = stages[i].dryMass + above;
      var dv = stages[i].isp * g0 * Math.log(m0 / mf);
      total += dv;
      details.push({ name: stages[i].name, m0: m0, mf: mf, deltaV: dv });
    }
    return { total: total, stages: details };
  };

  // ---------- 大气与阻力(简化指数模型) ----------
  P.airDensity = function (altitude, atm) {
    atm = atm || K.atmosphere;
    return atm.rho0 * Math.exp(-altitude / atm.H);
  };
  P.dynamicPressure = function (rho, v) { return 0.5 * rho * v * v; };
  P.dragForce = function (rho, v, Cd, A) { return 0.5 * rho * v * v * Cd * A; };

  // ============================================================
  // Lec.mount —— 页面统一挂载入口
  // ============================================================
  function escapeHtml(s) {
    s = (s === undefined || s === null) ? '' : String(s);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyle() {
    if (document.getElementById('lec-style')) { return; }
    var css =
      'body{margin:0;font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;}' +
      '.lec-head{background:#0b1220;color:#f5f7fa;padding:28px 24px 20px;box-sizing:border-box;}' +
      '.lec-head-inner{max-width:960px;margin:0 auto;}' +
      '.lec-kicker{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#7dd3fc;margin-bottom:6px;}' +
      '.lec-title{font-size:26px;line-height:1.35;margin:0 0 8px;font-weight:700;}' +
      '.lec-page{font-size:13px;color:#94a3b8;}' +
      '.lec-foot{background:#f1f5f9;color:#0f172a;padding:20px 24px;box-sizing:border-box;border-top:1px solid #e2e8f0;}' +
      '.lec-foot-inner{max-width:960px;margin:0 auto;}' +
      '.lec-take-label{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#0369a1;margin-bottom:4px;font-weight:700;}' +
      '.lec-take-text{font-size:15px;line-height:1.6;}';
    var style = document.createElement('style');
    style.id = 'lec-style';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function mount(cfg) {
    cfg = cfg || {};
    var idx = (cfg.index === undefined || cfg.index === null) ? '' : cfg.index;
    var kicker = cfg.kicker || '';
    var title = cfg.title || '';
    var take = cfg.take || '';
    var total = K.TOTAL_PAGES;

    injectStyle();

    var head = document.getElementById('lec-head');
    if (!head) {
      head = document.createElement('header');
      head.id = 'lec-head';
      if (document.body.firstChild) {
        document.body.insertBefore(head, document.body.firstChild);
      } else {
        document.body.appendChild(head);
      }
    }
    head.className = 'lec-head';
    head.innerHTML =
      '<div class="lec-head-inner">' +
        '<div class="lec-kicker">' + escapeHtml(kicker) + '</div>' +
        '<h1 class="lec-title">' + escapeHtml(title) + '</h1>' +
        '<div class="lec-page">第 ' + escapeHtml(idx) + ' 讲 / 共 ' + total + ' 讲</div>' +
      '</div>';

    var foot = document.getElementById('lec-foot');
    if (!foot) {
      foot = document.createElement('footer');
      foot.id = 'lec-foot';
      document.body.appendChild(foot);
    }
    foot.className = 'lec-foot';
    foot.innerHTML =
      '<div class="lec-foot-inner">' +
        '<div class="lec-take-label">要点</div>' +
        '<div class="lec-take-text">' + escapeHtml(take) + '</div>' +
      '</div>';

    if (title) {
      document.title = title + ' · ' + K.SERIES_TITLE;
    }

    return { head: head, foot: foot };
  }

  // ============================================================
  // 挂载到全局
  // ============================================================
  var Lec = { K: K, P: P, mount: mount };
  global.Lec = Lec;

})(typeof window !== 'undefined' ? window : this);