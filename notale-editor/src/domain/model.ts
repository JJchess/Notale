import { chartAuthoringSchema } from './chart-authoring.js';
import { vectorCommands } from './vector-schema.js';
import { canvasInstanceSchema } from './canvas-schema.js';
import { teachingStepSchema } from './teaching-step-schema.js';
import { transformSchema } from './transform-schema.js';
export { transformSchema } from './transform-schema.js';
import { sceneSettingsSchema, sceneValuesSchema } from './scene-schema.js';
import { sceneCheckpointSchema } from './scene-checkpoints.js';
import {
  nativeChartSchema,
  nativeChartOptionSchema,
  nativeChartStateSchema,
  learningRateSchema,
  nativeChartAppearancePatchSchema,
} from './native-charts.js';
import { connectorSchema } from './connectors.js';
import { patchObject } from './schema.js';
import { z } from 'zod';
import { componentSchema, componentPatchSchema } from './components.js';
import { containerLayoutSchema } from './container-layout.js';
import { mediaPatchSchema } from './media.js';
import { chartDataSchema } from './charts.js';

export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const filePath = z
  .string()
  .min(1)
  .max(500)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.includes('\\') &&
      !p.split('/').some((x) => x === '..' || x === '.' || x === '') &&
      !/[\x00-\x1f?#]/.test(p),
    'Expected a safe relative file path',
  );
const cssValue = z.union([z.string().max(5000), z.number().finite()]);
export const styleSchema = z.record(
  z.string().regex(/^(--[\w-]+|[a-z][a-z-]*)$/),
  z.string().max(10000),
);
export const animationSchema = z
  .object({
    id: identifier,
    target: identifier,
    step: z.number().int().min(0).max(500),
    trigger: z.enum(['click', 'with-previous', 'after-previous', 'object']),
    triggerTarget: identifier.optional(),
    effect: z.enum([
      'chart-state',
      'appear',
      'fade-in',
      'draw-stroke',
      'fade-out',
      'fly-in',
      'fly-out',
      'zoom-in',
      'pulse',
      'spin',
      'motion',
      'custom',
      'disappear', 'zoom-out', 'wipe-in', 'wipe-out', 'split-in', 'split-out', 'float-in', 'bounce-in',
    ]),
    chartStateId: identifier.optional(),
    duration: z.number().min(0).max(60000).default(500),
    delay: z.number().min(0).max(60000).default(0),
    easing: z.enum(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']).default('ease-out'),
    keyframes: z.array(z.record(z.string(), cssValue)).min(2).max(50).optional(),
    repeat: z.number().int().min(1).max(20).optional(),
    autoReverse: z.boolean().optional(),
    effectDirection: z.enum(['left','right','up','down']).optional(),
    path: z.array(z.object({x:z.number().finite(),y:z.number().finite()}).strict()).min(2).max(50).optional(),
    dx: z.number().finite().default(100),
    dy: z.number().finite().default(0),
  })
  .strict()
  .refine(
    (x) => x.trigger !== 'object' || !!x.triggerTarget,
    'Object trigger requires triggerTarget',
  )
  .refine((x) => x.effect !== 'custom' || !!x.keyframes, 'Custom effect requires keyframes')
  .refine((x) => {
    let offset = -1;
    return (
      !x.keyframes ||
      x.keyframes.every((frame) => {
        if (frame.offset !== undefined) {
          if (
            typeof frame.offset !== 'number' ||
            frame.offset < 0 ||
            frame.offset > 1 ||
            frame.offset < offset
          )
            return false;
          offset = frame.offset;
        }
        return (
          (frame.easing === undefined ||
            ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'].includes(
              String(frame.easing),
            )) &&
          (frame.composite === undefined ||
            ['replace', 'add', 'accumulate'].includes(String(frame.composite)))
        );
      })
    );
  }, 'Keyframe offsets must be ordered within 0..1, with supported easing and composition');
export type AnimationSpec = z.infer<typeof animationSchema>;
export const bindingSchema = z
  .object({
    id: identifier,
    target: identifier,
    label: z.string().max(200),
    value: z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
    event: z.enum(['input', 'change']).default('input'),
  })
  .strict();
export const rectangleSchema = z
  .object({
    id: identifier,
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().nonnegative().finite(),
    height: z.number().nonnegative().finite(),
    baseWidth: z.number().positive().optional(),
    baseHeight: z.number().positive().optional(),
    matrix: z.array(z.number().finite()).length(4).optional(),
    svgViewport: z
      .object({ width: z.number().positive().finite(), height: z.number().positive().finite() })
      .strict()
      .optional(),
    geometry: z
      .object({
        parent: z.array(z.number().finite()).length(4),
        local: z.array(z.number().finite()).length(6),
        origin: z.array(z.number().finite()).length(2),
        size: z.array(z.number().nonnegative()).length(2),
        center: z.array(z.number().finite()).length(2).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const layoutSchema = z
  .object({
    id: identifier,
    name: z.string().min(1).max(200),
    html: z.string().max(500000),
    css: z.string().max(100000).default(''),
    sourcePath: filePath.default('layout.html'),
    theme: styleSchema.default({}),
    layer: z.enum(['front', 'behind']).default('front'),
  })
  .strict();
export const guideSchema = z
  .object({
    id: identifier,
    axis: z.enum(['x', 'y']),
    position: z.number().finite().min(-100000).max(100000),
  })
  .strict();
export const layoutImageSchema = z
  .object({ path: filePath, alt: z.string().max(10000).optional() })
  .strict();
export const slideSchema = z
  .object({
    id: identifier,
    name: z.string().max(300),
    sourcePath: filePath,
    html: z.string().min(1).max(5_000_000),
    notes: z.string().max(100000).default(''),
    hidden: z.boolean().default(false),
    section: z.string().max(200).default(''),
    layoutId: identifier.nullable().default(null),
    layoutSourceId: identifier.optional(),
    layoutValues: z.record(identifier, z.record(identifier, z.string().max(100000))).optional(),
    layoutImages: z.record(identifier, z.record(identifier, layoutImageSchema)).optional(),
    theme: styleSchema.default({}),
    guides: z
      .array(guideSchema)
      .max(200)
      .refine(
        (guides) => new Set(guides.map((g) => g.id)).size === guides.length,
        'Guide IDs must be unique',
      )
      .default([]),
    transition: z.enum(['none', 'fade', 'slide', 'convex', 'concave', 'zoom']).default('fade'),
    advanceAfter: z.number().min(0).max(3600000).default(0),
    nativeStepCount: z.number().int().min(0).max(500).default(0),
    // Each presentation step can select a native script state. Empty means identity.
    stepMap: z.array(z.number().int().min(0).max(500)).max(501).default([]),
    steps: z.array(teachingStepSchema).min(1).max(501).optional(),
    animations: z.array(animationSchema).max(2000).default([]),
    bindings: z.array(bindingSchema).max(2000).default([]),
    groups: z
      .array(
        z
          .object({
            id: identifier,
            name: z.string().max(200),
            members: z.array(identifier).min(2),
          })
          .strict(),
      )
      .default([]),
    connectors: z.array(connectorSchema).max(1000).default([]),
    nativeCharts: z.record(identifier, nativeChartSchema).default({}),
    canvasInstances: z.record(identifier, canvasInstanceSchema).optional(),
    scenes: z.array(sceneSettingsSchema).max(100).optional(),
    components: z.array(componentSchema).max(500).optional(),
    constraints: z.record(identifier, containerLayoutSchema).optional(),
    locked: z.array(identifier).default([]),
    transforms: z.record(identifier, transformSchema).default({}),
  })
  .strict();
export const assetSchema = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    mime: z.string().max(200),
    size: z.number().int().min(0).max(50_000_000),
  })
  .strict();
export const componentDefinitionSchema = z
  .object({
    id: identifier,
    name: z.string().min(1).max(200),
    source: slideSchema,
    componentId: identifier,
    rectangles: z.array(rectangleSchema).max(1000).default([]),
    computedStyles: z.record(identifier, styleSchema).default({}),
  })
  .strict();
export const commentSchema = z
  .object({
    id: identifier,
    slideId: identifier,
    target: identifier.optional(),
    author: z.string().min(1).max(120),
    text: z.string().min(1).max(4000),
    createdAt: z.string().min(1).max(40),
    resolved: z.boolean().default(false),
    replies: z
      .array(
        z
          .object({ id: identifier, author: z.string().min(1).max(120), text: z.string().min(1).max(4000), createdAt: z.string().min(1).max(40) })
          .strict(),
      )
      .max(200)
      .default([]),
  })
  .strict();
export const documentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifier,
    title: z.string().min(1).max(300),
    width: z.number().int().min(100).max(10000).default(1600),
    height: z.number().int().min(100).max(10000).default(900),
    theme: styleSchema.default({}),
    layouts: z.array(layoutSchema).max(100).default([]),
    componentLibrary: z.array(componentDefinitionSchema).max(100).optional(),
    slides: z.array(slideSchema).min(1).max(1000),
    assets: z.record(filePath, assetSchema).default({}),
    comments: z.array(commentSchema).max(2000).default([]),
    presentation: z
      .object({ loop: z.boolean().default(false), showSlideNumber: z.boolean().default(true) })
      .strict()
      .default({ loop: false, showSlideNumber: true }),
  })
  .strict();
export type Slide = z.infer<typeof slideSchema>;
export type DeckDocument = z.infer<typeof documentSchema>;
export type Asset = z.infer<typeof assetSchema>;

const slideId = { slideId: identifier };
const target = { ...slideId, target: identifier };
const patch = z
  .object({
    text: z.string().max(100000).optional(),
    richText: z.string().max(200000).optional(),
    style: styleSchema.optional(),
    attributes: z
      .record(z.string().regex(/^[\w:-]+$/), z.string().max(10000).nullable())
      .optional(),
  })
  .strict();
export const commandSchema = z.discriminatedUnion('type', [
  ...vectorCommands,
  z
    .object({
      type: z.literal('deck.update'),
      title: z.string().min(1).max(300).optional(),
      width: z.number().int().min(100).max(10000).optional(),
      height: z.number().int().min(100).max(10000).optional(),
      theme: styleSchema.optional(),
      presentation: documentSchema.shape.presentation.removeDefault().optional(),
    })
    .strict(),
  z.object({ type: z.literal('layout.set'), layout: layoutSchema }).strict(),
  z.object({ type: z.literal('comment.set'), comment: commentSchema }).strict(),
  z.object({ type: z.literal('comment.remove'), id: identifier }).strict(),
  z.object({ type: z.literal('layout.remove'), id: identifier }).strict(),
  z.object({ type: z.literal('layout.detach'), ...slideId }).strict(),
  z.object({ type: z.literal('layout.checkout'), id: identifier, newId: identifier }).strict(),
  z.object({ type: z.literal('layout.publish'), ...slideId }).strict(),
  z
    .object({
      type: z.literal('layout.image'),
      ...slideId,
      id: identifier,
      key: identifier,
      image: layoutImageSchema.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('layout.values'),
      ...slideId,
      id: identifier,
      values: z.record(identifier, z.string().max(100000).nullable()),
    })
    .strict(),
  z
    .object({ type: z.literal('slide.insert'), after: identifier.nullable(), slide: slideSchema })
    .strict(),
  z.object({ type: z.literal('slide.duplicate'), ...slideId, newId: identifier }).strict(),
  z.object({ type: z.literal('slide.delete'), ...slideId }).strict(),
  z
    .object({ type: z.literal('slide.move'), ...slideId, index: z.number().int().nonnegative() })
    .strict(),
  z
    .object({
      type: z.literal('slide.update'),
      ...slideId,
      patch: patchObject(
        slideSchema.pick({
          name: true,
          notes: true,
          hidden: true,
          section: true,
          transition: true,
          advanceAfter: true,
          nativeStepCount: true,
          stepMap: true,
          layoutId: true,
          theme: true,
          guides: true,
        }).shape,
      ),
    })
    .strict(),
  z.object({ type: z.literal('connector.set'), ...slideId, connector: connectorSchema }).strict(),
  z.object({ type: z.literal('element.patch'), ...target, patch }).strict(),
  z.object({ type: z.literal('media.update'), ...target, patch: mediaPatchSchema }).strict(),
  z.object({type:z.literal('native-chart.convert'),...target}).strict(),
  z.object({ type: z.literal('chart.update'), ...target, data: chartDataSchema }).strict(),
  z
    .object({
      type: z.literal('table.edit'),
      ...target,
      action: z.enum([
        'insert-row',
        'delete-row',
        'insert-column',
        'delete-column',
        'merge',
        'unmerge',
      ]),
      row: z.number().int().min(0).max(500).default(0),
      column: z.number().int().min(0).max(200).default(0),
      rowSpan: z.number().int().min(1).max(500).default(1),
      colSpan: z.number().int().min(1).max(200).default(1),
    })
    .strict(),
  z
    .object({ type: z.literal('element.content'), ...target, html: z.string().max(500000) })
    .strict(),
  z
    .object({
      type: z.literal('element.insert'),
      ...slideId,
      parent: identifier.optional(),
      html: z.string().min(1).max(500000),
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z.object({ type: z.literal('element.delete'), ...target }).strict(),
  z.object({ type: z.literal('element.duplicate'), ...target }).strict(),
  z
    .object({
      type: z.literal('elements.order'),
      ...slideId,
      targets: z.array(identifier).min(1).max(500),
      action: z.enum(['front', 'back', 'forward', 'backward']),
    })
    .strict(),
  z
    .object({
      type: z.literal('elements.transfer'),
      ...slideId,
      sourceSlideId: identifier,
      sourceSnapshot: slideSchema.optional(),
      targets: z.array(identifier).min(1).max(500),
      mode: z.enum(['copy', 'cut']).default('copy'),
      offset: z
        .object({ x: z.number().finite(), y: z.number().finite() })
        .default({ x: 20, y: 20 }),
      rectangles: z.array(rectangleSchema).max(1000).default([]),
      computedStyles: z.record(identifier, styleSchema).default({}),
      nativeChartTargets: z.array(identifier).max(1000).optional(),
      nativeChartStates: z.record(identifier, nativeChartStateSchema).optional(),
      canvasSceneStates: z.record(identifier, sceneValuesSchema).optional(),
      componentStates: z.record(identifier, identifier).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('elements.arrange'),
      ...slideId,
      rectangles: z.array(rectangleSchema).min(1).max(1000),
      action: z.enum([
        'left',
        'center',
        'right',
        'top',
        'middle',
        'bottom',
        'distribute-x',
        'distribute-y',
        'translate',
        'rotate',
        'scale',
      ]),
      reference: z.enum(['selection', 'slide']).default('selection'),
      dx: z.number().finite().default(0),
      dy: z.number().finite().default(0),
      angle: z.number().finite().default(0),
      factor: z.number().positive().max(100).default(1),
      factorX: z.number().positive().max(100).optional(),
      factorY: z.number().positive().max(100).optional(),
      anchor: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('element.move'),
      ...target,
      parent: identifier,
      index: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({ type: z.literal('element.transform'), ...target, transform: transformSchema })
    .strict(),
  z.object({ type: z.literal('element.lock'), ...target, locked: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('group.set'),
      ...slideId,
      id: identifier,
      name: z.string().max(200),
      members: z.array(identifier).min(2),
    })
    .strict(),
  z.object({ type: z.literal('group.remove'), ...slideId, id: identifier }).strict(),
  z
    .object({
      type: z.literal('step.initialize'),
      ...slideId,
      nativeMax: z.number().int().min(0).max(500).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('step.insert'),
      ...slideId,
      index: z.number().int().min(1).max(500),
      step: teachingStepSchema,
    })
    .strict(),
  z
    .object({ type: z.literal('step.duplicate'), ...slideId, id: identifier, newId: identifier })
    .strict(),
  z.object({ type: z.literal('step.remove'), ...slideId, id: identifier }).strict(),
  z
    .object({
      type: z.literal('step.move'),
      ...slideId,
      id: identifier,
      index: z.number().int().min(1).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal('step.update'),
      ...slideId,
      id: identifier,
      patch: patchObject(teachingStepSchema.omit({ id: true }).shape),
    })
    .strict(),
  z.object({ type: z.literal('animation.set'), ...slideId, animation: animationSchema }).strict(),
  z.object({ type: z.literal('animation.remove'), ...slideId, id: identifier }).strict(),
  z.object({ type: z.literal('animation.reorder'), ...slideId, ids: z.array(identifier) }).strict(),
  z
    .object({ type: z.literal('native-chart.set'), ...target, option: nativeChartOptionSchema })
    .strict(),
  z.object({ type: z.literal('native-chart.remove'), ...target }).strict(),
  z.object({type:z.literal('native-chart.create'),...target,model:chartAuthoringSchema,x:z.number().finite().default(180),y:z.number().finite().default(140),width:z.number().min(160).max(10000).default(900),height:z.number().min(120).max(10000).default(520)}).strict(),
  z.object({type:z.literal('native-chart.edit'),...target,model:chartAuthoringSchema,before:chartAuthoringSchema.optional()}).strict(),
  z.object({type:z.literal('native-chart.reset'),...target,scope:z.enum(['appearance','data','all']).default('appearance')}).strict(),
  z
    .object({ type: z.literal('container.layout'), ...target, layout: containerLayoutSchema })
    .strict(),
  z
    .object({
      type: z.literal('component.publish'),
      ...slideId,
      id: identifier,
      definitionId: identifier,
      name: z.string().min(1).max(200),
      rectangles: z.array(rectangleSchema).max(1000).default([]),
      computedStyles: z.record(identifier, styleSchema).default({}),
    })
    .strict(),
  z
    .object({
      type: z.literal('component.instantiate'),
      ...slideId,
      definitionId: identifier,
      offset: z
        .object({ x: z.number().finite(), y: z.number().finite() })
        .default({ x: 20, y: 20 }),
    })
    .strict(),
  z
    .object({
      type: z.literal('component.override'),
      ...slideId,
      id: identifier,
      target: identifier,
      state: identifier.optional(),
      patch: componentPatchSchema.nullable(),
    })
    .strict(),
  z.object({ type: z.literal('component.unlink'), ...slideId, id: identifier }).strict(),
  z.object({ type: z.literal('component.library-remove'), definitionId: identifier }).strict(),
  z
    .object({ type: z.literal('component.checkout'), definitionId: identifier, newId: identifier })
    .strict(),
  z.object({ type: z.literal('component.set'), ...slideId, component: componentSchema }).strict(),
  z.object({ type: z.literal('component.remove'), ...slideId, id: identifier }).strict(),
  z
    .object({ type: z.literal('component.state'), ...slideId, id: identifier, state: identifier })
    .strict(),
  z
    .object({ type: z.literal('native-chart.state'), ...target, value: learningRateSchema })
    .strict(),
  z
    .object({
      type: z.literal('native-chart.component'),
      ...target,
      state: nativeChartStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('native-chart.appearance'),
      ...target,
      state: z.enum(['active', 'inactive']),
      patch: nativeChartAppearancePatchSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('scene.set'),
      ...slideId,
      sceneId: identifier,
      values: sceneValuesSchema,
    })
    .strict(),
  z.object({ type: z.literal('scene.remove'), ...slideId, sceneId: identifier }).strict(),
  z
    .object({
      type: z.literal('scene.checkpoint'),
      ...slideId,
      sceneId: identifier,
      checkpoint: sceneCheckpointSchema,
    })
    .strict(),
  z.object({ type: z.literal('binding.set'), ...slideId, binding: bindingSchema }).strict(),
  z.object({ type: z.literal('binding.remove'), ...slideId, id: identifier }).strict(),
  z.object({ type: z.literal('asset.put'), path: filePath, asset: assetSchema }).strict(),
  z.object({ type: z.literal('asset.remove'), path: filePath }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const commitSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    mutationId: identifier,
    commands: z.array(commandSchema).min(1).max(500),
  })
  .strict();
export type Commit = z.infer<typeof commitSchema>;
export interface Snapshot {
  version: number;
  document: DeckDocument;
  createdAt: string;
  actor: string;
}

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function invariant(ok: unknown, code: string, message: string, status = 422): asserts ok {
  if (!ok) throw new DomainError(code, message, status);
}
