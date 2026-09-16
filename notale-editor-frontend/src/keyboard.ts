/** Treat both composition signals as text input, never as an editor shortcut. */
export function isComposingKey(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}
