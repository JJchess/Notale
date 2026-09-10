/** Browser-safe integration contract: no persistence, server or filesystem dependencies. */
export { vectorMutationSchema,vectorActionSchema } from './domain/vector-schema.js';
export type { VectorMutation } from './domain/vector-schema.js';
export { editShortcut } from './browser/shortcuts.js';
export type { EditAction } from './browser/shortcuts.js';
export { htmlLayerCommands } from './domain/html-layers.js';
export type { SourceScene } from './domain/source-scenes.js';
export { sceneValuesSchema, type SceneScalar } from './domain/scene-schema.js';
export { sceneCheckpointSchema, type SceneCheckpoint } from './domain/scene-checkpoints.js';
export {
  nativeChartOptionSchema, nativeChartAppearancePatchSchema,
  type NativeChartInteraction, type NativeChartState,
} from './domain/native-charts.js';
export type { NativeChartInspection } from './browser/native-charts.js';
export { connectorSchema } from './domain/connectors.js';
export { selectIds } from './domain/selection.js';
export { isSvgLayer } from './domain/svg-layers.js';
export { mediaSettingsSchema } from './domain/media.js';
export {
  commitSchema, identifier,
  type Snapshot, type Slide, type Command, type AnimationSpec,
  type DeckDocument, type Asset,
} from './domain/model.js';
export { chartSvg } from './domain/charts.js';
export { componentSchema, type InteractiveComponent } from './domain/components.js';
export { containerLayoutSchema } from './domain/container-layout.js';

export { timeline, type Cue } from './domain/timeline.js';

export {chartKinds,chartNames,chartAuthoringSchema,chartStateSchema,newChart,compileChart,chartAtState,cleanChartReferences} from './domain/chart-authoring.js';
export type {ChartAuthoring,ChartKind,ChartState,ChartSelection} from './domain/chart-authoring.js';
