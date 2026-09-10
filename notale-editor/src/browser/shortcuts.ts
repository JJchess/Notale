export type EditAction =
  | { type: 'nudge'; dx: number; dy: number }
  | {
      type:
        | 'copy'
        | 'cut'
        | 'paste'
        | 'duplicate'
        | 'delete'
        | 'undo'
        | 'redo'
        | 'clear'
        | 'select-all'
        | 'save';
    };
export function editShortcut(e: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): EditAction | undefined {
  if (e.altKey) return;
  const key = e.key.toLowerCase(),
    command = e.ctrlKey || e.metaKey;
  if (command) {
    if (key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    const shortcuts: Record<string, Exclude<EditAction, { type: 'nudge' }>['type']> = {
      y: 'redo',
      c: 'copy',
      x: 'cut',
      v: 'paste',
      d: 'duplicate',
      a: 'select-all',
      s: 'save',
    };
    const action = Object.hasOwn(shortcuts, key) ? shortcuts[key] : undefined;
    if (action) return { type: action };
    return;
  }
  const direction = (
    { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] } as Record<
      string,
      number[]
    >
  )[key];
  if (direction)
    return {
      type: 'nudge',
      dx: direction[0] * (e.shiftKey ? 10 : 1),
      dy: direction[1] * (e.shiftKey ? 10 : 1),
    };
  if (key === 'delete' || key === 'backspace') return { type: 'delete' };
  if (key === 'escape') return { type: 'clear' };
}
