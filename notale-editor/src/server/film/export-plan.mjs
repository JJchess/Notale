/** One half-open source range and one output grid, shared by capture and encoding. */
export function exportPlan(document, options = {}) {
  const sourceRate = document.frameRate, rate = options.frameRate ?? sourceRate;
  const start = options.start ?? 0, end = options.end;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw Error('无效导出区间');
  for (const r of [sourceRate, rate]) if (!Number.isSafeInteger(r.numerator) || !Number.isSafeInteger(r.denominator) || r.numerator < 1 || r.denominator < 1) throw Error('无效导出帧率');
  const numerator = BigInt(end - start) * BigInt(sourceRate.denominator) * BigInt(rate.numerator);
  const denominator = BigInt(sourceRate.numerator) * BigInt(rate.denominator);
  const frames = Number((numerator + denominator - 1n) / denominator);
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > 2_000_000) throw Error('导出帧数超出范围');
  const origin = start * sourceRate.denominator / sourceRate.numerator;
  const sourceDuration = (end - start) * sourceRate.denominator / sourceRate.numerator;
  const duration = frames * rate.denominator / rate.numerator;
  return {version:1, start, end, sourceRate, rate, origin, sourceDuration, frames, duration, audioSamples:Math.round(duration * 48000)};
}

export function sampleTimes(plan, index, samples = 1) {
  if (!Number.isInteger(index) || index < 0 || index >= plan.frames || ![1,4,8].includes(samples)) throw Error('无效导出采样');
  const step = plan.rate.denominator / plan.rate.numerator, stop = plan.origin + plan.sourceDuration;
  return Array.from({length:samples}, (_, i) => Math.max(plan.origin, Math.min(stop - 1e-9, plan.origin + index * step + (samples > 1 ? ((i + .5) / samples - .5) * step * .5 : 0))));
}

export function validateEncoded(plan, probe, width, height) {
  const video = probe.streams?.find(stream => stream.codec_type === 'video');
  if (!video || Number(video.nb_read_frames) !== plan.frames || video.width !== width || video.height !== height) throw Error(`编码校验失败：应有 ${plan.frames} 帧、${width} × ${height}`);
  const [n,d] = String(video.r_frame_rate).split('/').map(Number);
  if (!n || !d || Math.abs(n / d - plan.rate.numerator / plan.rate.denominator) > 1e-7) throw Error('编码校验失败：帧率不符');
  return {...probe, expectedFrames:plan.frames, expectedDuration:plan.duration};
}
