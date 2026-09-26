import { z } from 'zod';

const bit = z.union([z.literal(0), z.literal(1)]);
export type BootstrapTree =
  | { isLeaf: true; label: 0 | 1; p: number }
  | {
      isLeaf: false;
      feature: 'x' | 'y';
      thresh: number;
      left: BootstrapTree;
      right: BootstrapTree;
    };
const leaf = z
  .object({ isLeaf: z.literal(true), label: bit, p: z.number().finite().min(0).max(1) })
  .strict();
function tree(depth: number): z.ZodType<BootstrapTree> {
  return depth === 0
    ? leaf
    : z.discriminatedUnion('isLeaf', [
        leaf,
        z
          .object({
            isLeaf: z.literal(false),
            feature: z.enum(['x', 'y']),
            thresh: z.number().finite(),
            left: tree(depth - 1),
            right: tree(depth - 1),
          })
          .strict(),
      ]);
}
const percent = z.union([
  z.number().finite().min(0).max(100),
  z.string().regex(/^(?:100(?:\.0)?|(?:\d|[1-9]\d)(?:\.\d)?)$/),
]);
export const sceneCheckpointSchema = z
  .object({
    adapter: z.literal('bootstrap-forest-v1'),
    state: z
      .object({
        m: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(25)]),
        runCount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
        trees: z.array(tree(4)).min(3).max(25),
        currentSample: z
          .array(z.object({ x: z.number().finite(), y: z.number().finite(), label: bit }).strict())
          .length(80),
        lastSingleGrid: z.array(bit).length(2000),
        lastBaggingGrid: z.array(bit).length(2000),
        diffSingle: percent,
        diffBagging: percent,
      })
      .strict()
      .refine(
        (state) => state.trees.length === state.m,
        'Tree count must match the selected ensemble',
      ),
    locals: z.object({ seedCounter: z.number().int().min(1).max(2147483646) }).strict(),
  })
  .strict();
export type SceneCheckpoint = z.infer<typeof sceneCheckpointSchema>;

// The adapter restores a known private model and calls its original renderer.
// Exact source matching prevents applying that contract to an unrelated closure.
export function checkpointAdapter(sourceHash: string, variable: string) {
  return sourceHash === 'ab5457aba4d955bd0297e4ecfb0c428b48ff7e085f77213cf2feba809fcfe2bf' &&
    variable === 'state'
    ? ('bootstrap-forest-v1' as const)
    : undefined;
}

export function checkpointHooks(sceneId: string): string {
  return `\n;(window.__NOTALE_CHECKPOINTS__??={})[${JSON.stringify(sceneId)}]={
    capture:()=>({adapter:"bootstrap-forest-v1",state:structuredClone(state),locals:{seedCounter}}),
    restore:(checkpoint)=>{Object.assign(state,structuredClone(checkpoint.state));seedCounter=checkpoint.locals.seedCounter;updateUI();}
  };\n`;
}
