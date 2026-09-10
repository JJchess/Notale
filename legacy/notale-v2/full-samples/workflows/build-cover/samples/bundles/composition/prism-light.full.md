<sample id="prism-light" category="composition" variant="full">
  <file path="samples/composition/prism-light/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>解剖一束光</title>
  <link rel="stylesheet" href="assets/base.css">
  <style>
    :root {
      --bg: #11110f;
      --text: #f3f7f8;
      --font-sans: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", system-ui, sans-serif;
      --font-display: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", STSong, serif;
      --field-deep: #10110f;
      --field-mid: #181814;
      --ink-muted: #aaa79d;
      --focus: #f0e5ca;
      --ease-out: cubic-bezier(.16, 1, .3, 1);
    }

    html, body { background: #090908; }

    #stage {
      isolation: isolate;
      background:linear-gradient(124deg,var(--field-mid) 0,var(--field-deep) 54%,#0b0c0a 100%);
      contain: layout paint;
    }

    #stage::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 8;
      pointer-events: none;
      box-shadow:inset 0 0 150px rgba(0,0,0,.48);
    }

    #stage:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: -8px;
    }

    .cover-copy {
      position: absolute;
      left: 112px;
      top: 104px;
      width: 620px;
      z-index: 6;
      pointer-events: none;
    }

    .cover-title {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: max-content;
      max-width: 100%;
      color: #f2f5f5;
      font-family: var(--font-display);
      font-weight: 600;
      letter-spacing: -.075em;
    }

    .title-prefix {
      font-size: 108px;
      line-height: .98;
      white-space: nowrap;
    }

    .title-light {
      margin-top: 14px;
      font-size: 188px;
      line-height: .84;
      letter-spacing: -.12em;
    }

    .cover-subtitle {
      margin-top: 48px;
      color: var(--ink-muted);
      font-size: 25px;
      font-weight: 400;
      line-height: 1.5;
      letter-spacing: .095em;
      white-space: nowrap;
    }

    .cover-subtitle::before {
      content: "";
      display: inline-block;
      width: 38px;
      height: 1px;
      margin: 0 18px 8px 2px;
      background:rgba(230,224,207,.58);
    }

    .scene {
      z-index: 3;
      overflow: hidden;
      pointer-events: none;
    }

    .spectrum-wrap {
      position: absolute;
      left: 1240px;
      top: 376px;
      z-index: 2;
      width: 360px;
      height: 462px;
      overflow: visible;
      opacity: .92;
      mix-blend-mode: screen;
      pointer-events: none;
      transform-origin: 0 34%;
    }

    .spectrum-fan,
    .spectrum-fan::before {
      position: absolute;
      inset: 0;
      clip-path: polygon(0 31.4%, 100% 1.8%, 100% 98%, 0 36.8%);
      background: conic-gradient(
        from 70deg at 0 34%,
        #ff352c 0deg,
        #ff6f29 8deg,
        #ffb622 15deg,
        #f5e94a 22deg,
        #57df69 30deg,
        #2bd9cf 38deg,
        #268eff 46deg,
        #554cff 53deg,
        #9b3dff 60deg
      );
      -webkit-mask-image: linear-gradient(90deg, rgba(0, 0, 0, .72) 0, #000 20%, #000 82%, rgba(0, 0, 0, .8) 100%);
      mask-image: linear-gradient(90deg, rgba(0, 0, 0, .72) 0, #000 20%, #000 82%, rgba(0, 0, 0, .8) 100%);
    }

    .spectrum-fan::before {
      content: "";
      filter:blur(12px);
      opacity:.2;
      transform: scaleY(1.04);
    }

    .field-reflection {
      opacity: .48;
      mix-blend-mode: screen;
    }

    .incident-halo,
    .incident-body,
    .incident-core,
    .prism-group {
      transform-box: fill-box;
    }

    .incident-halo,
    .incident-body,
    .incident-core {
      transform-origin: right center;
    }

    .prism-group { transform-origin: 1062px 454px; }

    .glass-sheen { animation: sheen-breathe 8s ease-in-out infinite alternate; }

    .is-entering .cover-title { animation: title-settle 1050ms var(--ease-out) both; }
    .is-entering .cover-subtitle { animation: subtitle-settle 900ms 180ms var(--ease-out) both; }
    .is-entering .prism-group { animation: prism-settle 1350ms 80ms var(--ease-out) both; }

    .is-entering .incident-halo,
    .is-entering .incident-body,
    .is-entering .incident-core {
      animation: beam-settle 1200ms 160ms var(--ease-out) both;
    }

    .is-entering .spectrum-wrap { animation: spectrum-settle 1450ms 300ms var(--ease-out) both; }

    .is-paused .glass-sheen,
    .is-paused .spectrum-wrap {
      animation-play-state: paused !important;
    }

    @keyframes title-settle {
      from { opacity: .82; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes subtitle-settle {
      from { opacity: .68; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes prism-settle {
      from { opacity: .86; transform: translate(12px, -7px) scale(.987); }
      to { opacity: 1; transform: translate(0, 0) scale(1); }
    }

    @keyframes beam-settle {
      from { opacity: .58; transform: scaleX(.975); }
      to { opacity: 1; transform: scaleX(1); }
    }

    @keyframes spectrum-settle {
      from { opacity: .62; transform: scaleX(.94); }
      to { opacity: .92; transform: scaleX(1); }
    }

    @keyframes sheen-breathe {
      from { opacity: .18; transform: translateX(-5px); }
      to { opacity: .34; transform: translateX(8px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .glass-sheen,
      .spectrum-wrap,
      .cover-title,
      .cover-subtitle,
      .prism-group,
      .incident-halo,
      .incident-body,
      .incident-core {
        animation: none !important;
        opacity: 1;
        transform: none;
      }

      .spectrum-wrap { opacity: .92; }
    }
  </style>
</head>
<body>
  <main id="stage" tabindex="0" aria-labelledby="cover-title" aria-describedby="cover-subtitle">
    <header class="cover-copy">
      <h1 class="cover-title" id="cover-title">
        <span class="title-prefix">解剖一束</span>
        <span class="title-light">光</span>
      </h1>
      <p class="cover-subtitle" id="cover-subtitle">折射、色散与我们看见的颜色</p>
    </header>

    <div class="spectrum-wrap" aria-hidden="true">
      <div class="spectrum-fan"></div>
    </div>

    <svg class="scene cv-fill" viewBox="0 0 1600 900" role="img" aria-labelledby="optical-title optical-description" focusable="false">
      <title id="optical-title">玻璃棱镜中的白光色散</title>
      <desc id="optical-description">一束白光从左侧进入具有厚度与切面的玻璃三棱镜，经过内部折射后，从右侧展开为连续光谱。</desc>
      <defs>
        <linearGradient id="incidentStroke" x1="0" y1="611" x2="874" y2="542" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#ddd8cc" stop-opacity="0"/>
          <stop offset=".16" stop-color="#f2eee4" stop-opacity=".54"/>
          <stop offset=".64" stop-color="#fff" stop-opacity=".9"/>
          <stop offset="1" stop-color="#fff"/>
        </linearGradient>
        <linearGradient id="frontGlass" x1="842" y1="249" x2="1197" y2="680" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fffaf0" stop-opacity=".18"/>
          <stop offset=".28" stop-color="#9b9a92" stop-opacity=".08"/>
          <stop offset=".58" stop-color="#f2eee2" stop-opacity=".025"/>
          <stop offset=".82" stop-color="#c3c0b6" stop-opacity=".14"/>
          <stop offset="1" stop-color="#fffdf5" stop-opacity=".23"/>
        </linearGradient>
        <linearGradient id="rearGlass" x1="1084" y1="153" x2="1156" y2="653" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#ddd9ce" stop-opacity=".11"/>
          <stop offset=".58" stop-color="#353630" stop-opacity=".18"/>
          <stop offset="1" stop-color="#c9c6bb" stop-opacity=".09"/>
        </linearGradient>
        <linearGradient id="rightFacet" x1="1014" y1="214" x2="1322" y2="630" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fffdf7" stop-opacity=".25"/>
          <stop offset=".32" stop-color="#b8b6ad" stop-opacity=".11"/>
          <stop offset=".71" stop-color="#42433d" stop-opacity=".3"/>
          <stop offset="1" stop-color="#eeeae0" stop-opacity=".19"/>
        </linearGradient>
        <linearGradient id="bottomFacet" x1="840" y1="679" x2="1290" y2="651" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#30312d" stop-opacity=".25"/>
          <stop offset=".4" stop-color="#eeeae0" stop-opacity=".13"/>
          <stop offset="1" stop-color="#77766f" stop-opacity=".19"/>
        </linearGradient>
        <linearGradient id="edgeLight" x1="813" y1="701" x2="1232" y2="194" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#bbb8ad" stop-opacity=".34"/>
          <stop offset=".32" stop-color="#fffdf7" stop-opacity=".96"/>
          <stop offset=".64" stop-color="#cbc7bb" stop-opacity=".44"/>
          <stop offset="1" stop-color="#fffef9" stop-opacity=".82"/>
        </linearGradient>
        <linearGradient id="insideSpectrum" x1="867" y1="544" x2="1259" y2="523" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fff"/>
          <stop offset=".46" stop-color="#eafcff"/>
          <stop offset=".72" stop-color="#fff6a5"/>
          <stop offset=".82" stop-color="#68f0d4"/>
          <stop offset=".91" stop-color="#65a8ff"/>
          <stop offset="1" stop-color="#d58cff"/>
        </linearGradient>
        <radialGradient id="groundCaustic" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#f1eadc" stop-opacity=".2"/>
          <stop offset=".48" stop-color="#aaa79d" stop-opacity=".07"/>
          <stop offset="1" stop-color="#3b3c37" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="exitFlare" cx="50%" cy="50%" r="50%">
          <stop offset="0" stop-color="#fff" stop-opacity=".98"/>
          <stop offset=".24" stop-color="#f5f0e5" stop-opacity=".62"/>
          <stop offset="1" stop-color="#c8c4b9" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="sheenFill" x1="886" y1="318" x2="1168" y2="579" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/>
          <stop offset=".46" stop-color="#fffdf7" stop-opacity=".05"/>
          <stop offset=".55" stop-color="#fffdf7" stop-opacity=".42"/>
          <stop offset=".64" stop-color="#fffdf7" stop-opacity=".03"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </linearGradient>
        <filter id="beamGlow" x="-20%" y="-80%" width="150%" height="260%" color-interpolation-filters="sRGB">
          <feGaussianBlur stdDeviation="9"/>
        </filter>
        <filter id="edgeGlow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glassShadow" x="-30%" y="-30%" width="180%" height="190%" color-interpolation-filters="sRGB">
          <feDropShadow dx="16" dy="22" stdDeviation="23" flood-color="#01070b" flood-opacity=".78"/>
        </filter>
        <filter id="softBlur" x="-30%" y="-120%" width="170%" height="340%">
          <feGaussianBlur stdDeviation="17"/>
        </filter>
        <clipPath id="frontClip">
          <polygon points="986,198 810,704 1210,690"/>
        </clipPath>
        <clipPath id="rightClip">
          <polygon points="986,198 1210,690 1314,646 1090,154"/>
        </clipPath>
      </defs>

      <g class="field-reflection">
        <ellipse cx="1064" cy="737" rx="330" ry="58" fill="url(#groundCaustic)" filter="url(#softBlur)"/>
        <path d="M865 716 C1002 742 1190 728 1325 670" fill="none" stroke="#d3cfc3" stroke-opacity=".1" stroke-width="2"/>
      </g>

      <g class="incident-light" fill="none" stroke-linecap="round">
        <path class="incident-halo" d="M0 611 L868 544" stroke="url(#incidentStroke)" stroke-width="36" opacity=".34" filter="url(#beamGlow)"/>
        <path class="incident-body" d="M0 611 L868 544" stroke="url(#incidentStroke)" stroke-width="13" opacity=".86"/>
        <path class="incident-core" d="M0 611 L868 544" stroke="#fff" stroke-opacity=".96" stroke-width="2.4"/>
      </g>

      <g class="spectral-edges" fill="none" stroke-linecap="round" opacity=".48">
        <path class="spectral-edge" d="M1256 518 L1600 402" stroke="#ff5544" stroke-width="2.1" filter="url(#edgeGlow)"/>
        <path class="spectral-edge" d="M1257 536 L1600 802" stroke="#914cff" stroke-width="2.2" filter="url(#edgeGlow)"/>
      </g>

      <g class="prism-group" filter="url(#glassShadow)">
        <polygon points="1090,154 914,660 1314,646" fill="url(#rearGlass)" stroke="#9de8f2" stroke-opacity=".26" stroke-width="2"/>

        <polygon points="986,198 810,704 914,660 1090,154" fill="#4a8998" fill-opacity=".07" stroke="#c8f8ff" stroke-opacity=".19" stroke-width="1.5"/>
        <polygon points="810,704 1210,690 1314,646 914,660" fill="url(#bottomFacet)" stroke="#a7edf6" stroke-opacity=".26" stroke-width="1.6"/>
        <polygon points="986,198 1210,690 1314,646 1090,154" fill="url(#rightFacet)" stroke="#d8fbff" stroke-opacity=".33" stroke-width="1.8"/>

        <polygon points="986,198 810,704 1210,690" fill="url(#frontGlass)" stroke="url(#edgeLight)" stroke-width="6" stroke-linejoin="round"/>

        <g clip-path="url(#frontClip)">
          <polygon points="986,198 1040,452 810,704" fill="#c7f6ff" fill-opacity=".045"/>
          <polygon points="986,198 1040,452 1210,690" fill="#4e9caf" fill-opacity=".07"/>
          <polygon points="810,704 1040,452 1210,690" fill="#d9fbff" fill-opacity=".035"/>

          <g fill="none">
            <path d="M868 544 L1048 551 L1154 558" stroke="#dffbff" stroke-opacity=".27" stroke-width="29" filter="url(#beamGlow)"/>
            <path class="inside-ray" d="M868 544 L1048 551 L1154 558" stroke="url(#insideSpectrum)" stroke-opacity=".86" stroke-width="8.5" stroke-linecap="round"/>
            <path d="M868 544 L1048 551 L1154 558" stroke="#fff" stroke-opacity=".92" stroke-width="1.7" stroke-linecap="round"/>

            <path d="M1048 551 L1123 635" stroke="#aeeaf3" stroke-opacity=".17" stroke-width="2.1"/>
            <path d="M1123 635 L1027 262" stroke="#d9fbff" stroke-opacity=".115" stroke-width="1.5"/>
            <path d="M884 650 L1163 640" stroke="#efffff" stroke-opacity=".12" stroke-width="2"/>
          </g>

          <polygon class="glass-sheen" points="900,234 973,207 1158,676 1086,679" fill="url(#sheenFill)"/>
        </g>

        <g clip-path="url(#rightClip)" fill="none">
          <path d="M1153 558 L1258 525" stroke="#c9f8ff" stroke-opacity=".34" stroke-width="30" filter="url(#beamGlow)"/>
          <path class="thickness-ray" d="M1153 558 L1258 525" stroke="url(#insideSpectrum)" stroke-opacity=".9" stroke-width="9" stroke-linecap="round"/>
          <path d="M1153 558 L1258 525" stroke="#fff" stroke-opacity=".9" stroke-width="1.8" stroke-linecap="round"/>
        </g>

        <polygon points="991,222 836,683 1183,671" fill="none" stroke="#e5fcff" stroke-opacity=".2" stroke-width="1.8"/>
        <path d="M986 198 L1090 154 L1314 646" fill="none" stroke="#e9ffff" stroke-opacity=".42" stroke-width="2.2"/>
        <path d="M1210 690 L1314 646" fill="none" stroke="#b8f2f8" stroke-opacity=".58" stroke-width="2.4"/>
        <path d="M810 704 L914 660" fill="none" stroke="#66b8c7" stroke-opacity=".34" stroke-width="2"/>

        <circle cx="868" cy="544" r="7" fill="url(#exitFlare)" filter="url(#edgeGlow)"/>
        <ellipse cx="1258" cy="525" rx="21" ry="16" fill="url(#exitFlare)" filter="url(#edgeGlow)"/>
        <path d="M971 215 L986 198 L1002 209" fill="none" stroke="#fff" stroke-opacity=".84" stroke-width="2.3" stroke-linecap="round"/>
      </g>
    </svg>
  </main>

  <script src="assets/base.js"></script>
  <script>
    (function () {
      'use strict';

      var stage = document.getElementById('stage');
      var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
      var settleTimer = 0;
      var disposed = false;

      function reduced() {
        return motionQuery ? motionQuery.matches : Deck.reduced();
      }

      function settle() {
        if (disposed) return;
        stage.classList.remove('is-entering');
        stage.classList.add('is-settled');
      }

      function syncMotion() {
        stage.classList.toggle('is-reduced', reduced());
        if (!reduced()) return;
        clearTimeout(settleTimer);
        settle();
      }

      function replay() {
        if (disposed) return;
        clearTimeout(settleTimer);
        stage.classList.remove('is-entering', 'is-settled');
        void stage.offsetWidth;

        if (reduced()) {
          stage.classList.add('is-settled');
          return;
        }

        stage.classList.add('is-entering');
        settleTimer = setTimeout(settle, 1900);
      }

      function onKeydown(event) {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        var key = event.key;
        if (key === 'r' || key === 'R' || key === 'Home' || ((key === 'Enter' || key === ' ') && event.target === stage)) {
          event.preventDefault();
          replay();
        }
      }

      function onVisibility() {
        stage.classList.toggle('is-paused', document.hidden);
      }

      function dispose() {
        if (disposed) return;
        disposed = true;
        clearTimeout(settleTimer);
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('visibilitychange', onVisibility);
        if (motionQuery) {
          if (motionQuery.removeEventListener) motionQuery.removeEventListener('change', syncMotion);
          else if (motionQuery.removeListener) motionQuery.removeListener(syncMotion);
        }
      }

      document.addEventListener('keydown', onKeydown);
      document.addEventListener('visibilitychange', onVisibility);
      if (motionQuery) {
        if (motionQuery.addEventListener) motionQuery.addEventListener('change', syncMotion);
        else if (motionQuery.addListener) motionQuery.addListener(syncMotion);
      }
      window.addEventListener('pagehide', dispose, { once: true });
      syncMotion();
      replay();
    })();
  </script>
</body>
</html>
```
  </file>
  <omitted path="assets/base.css">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
  <omitted path="assets/base.js">provided by the deck chassis or the vendored library index; not part of this sample</omitted>
</sample>
