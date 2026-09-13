import type { Slide } from './model.js';
import { parse, elements, attr, NODE_ID } from './html.js';
import { inspectChartSources } from './chart-sources.js';
import type { NativeChartInteraction } from './native-charts.js';
import { createHash } from 'node:crypto';
export const learningRateHash = 'd06703df03c3929a0491e60e9e29fc52525c551829c29288ec75bc77d893be53';
export function isLearningRateSource(script: string) {
  return createHash('sha256').update(script).digest('hex') === learningRateHash;
}
export function interactionMembers(interaction: NativeChartInteraction) {
  return [
    interaction.root,
    ...Object.values(interaction.controls),
    ...Object.values(interaction.metrics),
  ];
}
export function inspectChartComponents(slide: Slide): Map<string, NativeChartInteraction> {
  const out = new Map<string, NativeChartInteraction>(),
    nodes = elements(parse(slide.html));
  for (const [id, source] of inspectChartSources(slide)) {
    if (slide.nativeCharts[id]?.interaction) {
      out.set(id, slide.nativeCharts[id].interaction!);
      continue;
    }
    if (slide.nativeCharts[id]?.source || !isLearningRateSource(source.script)) continue;
    const host = nodes.find((n) => attr(n, NODE_ID) === id)!;
    const metricIds = {
      optM: 'val-opt-m',
      minErr: 'val-min-err',
      overfit: 'val-overfit',
      verdict: 'verdict-text',
    };
    const metricNodes = Object.values(metricIds).map((domId) =>
      nodes.find((n) => attr(n, 'id') === domId),
    );
    if (metricNodes.some((n) => !n)) continue;
    let root = host.parentNode;
    while (root && 'tagName' in root && !metricNodes.every((n) => elements(root!).includes(n!)))
      root = root.parentNode;
    if (!root || !('tagName' in root) || !attr(root, NODE_ID)) continue;
    const componentNodes = elements(root);
    const rates = ['1.0', '0.1', '0.02'] as const;
    const controls = rates.map((rate) =>
      componentNodes.filter(
        (n) =>
          n.tagName === 'button' &&
          attr(n, 'data-lr') === rate &&
          (attr(n, 'class') ?? '').split(' ').includes('tab-btn'),
      ),
    );
    if (controls.some((list) => list.length !== 1)) continue;
    out.set(id, {
      adapter: 'learning-rate-v1',
      root: attr(root, NODE_ID)!,
      controls: Object.fromEntries(
        rates.map((rate, i) => [rate, attr(controls[i][0], NODE_ID)!]),
      ) as NativeChartInteraction['controls'],
      metrics: Object.fromEntries(
        Object.keys(metricIds).map((key, i) => [key, attr(metricNodes[i]!, NODE_ID)!]),
      ) as NativeChartInteraction['metrics'],
      value: '0.1',
      active: {
        backgroundColor: '#17628e',
        color: '#ffffff',
        borderColor: '#17628e',
        fontWeight: '700',
      },
      inactive: {
        backgroundColor: 'transparent',
        color: '#142630',
        borderColor: '#a8b7bf',
        fontWeight: '400',
      },
    });
  }
  return out;
}
