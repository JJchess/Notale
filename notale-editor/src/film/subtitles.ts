import { type FilmRate, type FilmSubtitleTrack, filmAssert, frameSeconds, secondsFrame, emptyFilm, parseFilmDocument } from '@notale/format/film';

function stamp(value: string): number {
  const m = /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
  filmAssert(m && Number(m[2]) < 60 && Number(m[3]) < 60, `Invalid VTT timestamp: ${value}`);
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}
function formatStamp(seconds: number): string {
  const ms = Math.round(seconds * 1000), total = Math.floor(ms / 1000);
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(v => String(v).padStart(2, '0')).join(':') + '.' + String(ms % 1000).padStart(3, '0');
}
function validateTrack(track: FilmSubtitleTrack, rate: FilmRate) {
  const doc = emptyFilm('subtitle-validation', '', rate); doc.tracks = [{...track,wordSourceId:undefined,sourceClipId:undefined,sourceCaptionId:undefined}]; parseFilmDocument(doc);
}
/** VTT is quantized to the film's frame grid once on ingress. Preserve cue payload,
 * voice/word tags, settings and metadata; malformed input is an error, not lost text. */
export function importVtt(raw: string, options: { id: string; language: string; rate: FilmRate; title?: string }): FilmSubtitleTrack {
  const normalized = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd();
  const blocks = normalized.split(/\n[ \t]*\n/), header = blocks.shift() ?? '';
  filmAssert(/^WEBVTT(?:[ \t][^\n]*)?$/.test(header), 'Missing or invalid WEBVTT header');
  const track: FilmSubtitleTrack = { id: options.id, title: options.title ?? options.language,
    kind: 'subtitle', language: options.language, locked: false, hidden: false, muted: false, cues: [], vttBlocks: [], vttHeader: header.slice(6) };
  for (const block of blocks) {
    if (!block.trim()) continue;
    if (/^(NOTE(?:[ \t\n]|$)|STYLE\n|REGION\n)/.test(block)) { track.vttBlocks!.push(block); continue; }
    const lines = block.split('\n');
    const vttId = lines[0].includes('-->') ? undefined : lines.shift();
    const timing = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+(.*))?$/.exec(lines.shift() ?? '');
    filmAssert(timing && lines.length && lines.join('\n').trim(), 'Invalid or empty VTT cue');
    const start = stamp(timing[1]), end = stamp(timing[2]);
    filmAssert(end > start, 'VTT cue end must follow start');
    const at = secondsFrame(start, options.rate), until = secondsFrame(end, options.rate);
    filmAssert(until > at, 'VTT cue is shorter than one film frame');
    track.cues.push({ id: `${options.id}:cue:${track.cues.length + 1}`, at, duration: until - at,
      text: lines.join('\n'), ...(vttId ? { vttId } : {}), ...(timing[3] ? { settings: timing[3] } : {}) });
  }
  validateTrack(track, options.rate); return track;
}
export function exportVtt(track: FilmSubtitleTrack, rate: FilmRate): string {
  validateTrack(track, rate);
  const blocks = [`WEBVTT${track.vttHeader ?? ''}`, ...(track.vttBlocks ?? []),
    ...[...track.cues].sort((a, b) => a.at - b.at).map(c => [
      ...(c.vttId ? [c.vttId] : []),
      `${formatStamp(frameSeconds(c.at, rate))} --> ${formatStamp(frameSeconds(c.at + c.duration, rate))}${c.settings ? ' ' + c.settings : ''}`,
      c.text,
    ].join('\n'))];
  return blocks.join('\n\n') + '\n\n';
}
