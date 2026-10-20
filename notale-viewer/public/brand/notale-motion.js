// Notale 标识动效的接线。SVG 要内联在页面里（<img> 里的 SMIL 拿不到时间线）。
// 悬停不用 JS：notale-hover.svg 自己监听 mouseenter；按下见 notale-motion.css；减少动态由各 SVG 内的媒体查询处理。

const LOADING_CYCLE = 2.4; // 与 notale-loading.svg 的 dur 一致

/** 从头重播一个 SMIL 标识（开场、完成）。 */
export function replay(svg) {
  svg.setCurrentTime(0);
  svg.unpauseAnimations();
}

/**
 * 加载 → 完成。加载每圈的首尾都是空画面，完成动画的开头又和加载的前 1.25 秒相同，
 * 所以等这一圈走完再换，接缝处没有跳变。返回的 Promise 在换上完成动画时兑现。
 */
export function finish(loading, done) {
  const left = LOADING_CYCLE - (loading.getCurrentTime() % LOADING_CYCLE);
  return new Promise(resolve => setTimeout(() => {
    loading.replaceWith(done);
    replay(done);
    resolve(done);
  }, left * 1000));
}
