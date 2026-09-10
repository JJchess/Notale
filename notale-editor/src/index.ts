export { createApps, type AppOptions, type Integration } from './server/app.js';
export { Store, type Context, type AssetInput, sha256 } from './server/store.js';
export {
  documentSchema,
  slideSchema,
  commandSchema,
  commitSchema,
  animationSchema,
  DomainError,
  type DeckDocument,
  type Slide,
  type Snapshot,
  type Command,
  type Commit,
  type AnimationSpec,
} from './domain/model.js';
export { applyCommands, validateDocument } from './domain/commands.js';
export { importHtml, inspectSlide, normalizeHtml } from './domain/html.js';
export { timeline, maxStep } from './domain/timeline.js';
export { references, missingReferences } from './domain/resources.js';
export {
  layoutImageSchema,
  layoutSchema,
  transformSchema,
  rectangleSchema,
} from './domain/model.js';
export { chartDataSchema, chartMarkup, chartSvg, type ChartData } from './domain/charts.js';
export { tableGrid } from './domain/tables.js';
export { arrangeCommands } from './domain/arrange.js';

export { mediaSettingsSchema, mediaPatchSchema, type MediaSettings } from './domain/media.js';

export { materializeLayout, layoutPlaceholders, layoutImageSlots } from './domain/layouts.js';
export type { Stylesheets } from './domain/layout-css.js';
export { guideSchema } from './domain/model.js';
export {
  snapTranslation,
  snapResize,
  snapConstrainedPoint,
  type SnapPoint,
  type ResizeHandle,
  type ResizeResult,
  type SnapRect,
  type SnapLine,
  type SnapOptions,
} from './domain/snapping.js';

export { selectIds, type SelectionObject, type SelectionMode } from './domain/selection.js';

export { isSvgLayer } from './domain/svg-layers.js';

export {
  connectorSchema,
  connectorEndpointSchema,
  type ConnectorEndpoint,
  connectorSvg,
  connectorGeometry,
  type Connector,
  type Port,
} from './domain/connectors.js';

export {
  nativeChartSchema,
  nativeChartOptionSchema,
  nativeChartInteractionSchema,
  nativeChartStateSchema,
  nativeChartAppearancePatchSchema,
  learningRateSchema,
  type NativeChartInteraction,
  type NativeChartState,
  type NativeChartAppearancePatch,
  type LearningRate,
  type NativeChart,
  type NativeChartOption,
} from './domain/native-charts.js';

export {
  sceneScalarSchema,
  sceneValuesSchema,
  sceneSettingsSchema,
  type SceneScalar,
  type SceneSettings,
} from './domain/scene-schema.js';
export {
  inspectSourceScenes,
  validateSceneValues,
  type SourceScene,
  type SceneParameter,
} from './domain/source-scenes.js';
export type { SceneChoice } from './domain/scene-choices.js';
export { inspectChartSources } from './domain/chart-sources.js';
export type { NativeChartSource } from './domain/native-charts.js';
export {
  sceneCheckpointSchema,
  type SceneCheckpoint,
  type BootstrapTree,
} from './domain/scene-checkpoints.js';

export { inspectChartComponents } from './domain/chart-components.js';
export {
  componentSchema,
  componentPatchSchema,
  componentTargets,
  type InteractiveComponent,
  type ComponentPatch,
} from './domain/components.js';

export { componentDefinitionSchema } from './domain/model.js';
export { componentInstanceSchema } from './domain/components.js';
export { containerLayoutSchema, type ContainerLayout } from './domain/container-layout.js';

export { teachingStepSchema, type TeachingStep } from './domain/teaching-step-schema.js';
export { stepLabel, stepNotes, stepInterval } from './domain/timeline.js';

export { htmlLayerCommands } from './domain/html-layers.js';

export {
  canvasInstanceSchema,
  inspectCanvasSources,
  canvasSceneDescriptor,
  type CanvasInstance,
} from './domain/canvas-instances.js';
