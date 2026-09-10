/** Product gates: keep unfinished integrations out of the user-facing editor.
 * These are UI release gates, not authorization checks. The underlying backend
 * APIs and development workbench retain their existing capabilities.
 * Remove a gate only with recorded integration evidence for its workflow.
 */
const pendingIntegrations = [
  '#layout-source-controls', '#layout-placeholder-author', '#visual-layout-preset',
  '#publish-layout-canvas',
  '#property-advanced', '[data-component-pending]',
  '#author-native-value',
  '[data-tool="components"]', '[data-library="components"]',
  '[data-inspect="author-components"]',
];
export function applyFeatureAvailability() {
  for (const selector of pendingIntegrations) {
    for (const control of document.querySelectorAll<HTMLElement>(selector)) {
      const node = control instanceof HTMLSelectElement ? control.closest<HTMLElement>('label') ?? control : control;
      node.dataset.editorUnavailable = 'true';
      node.hidden = true;
      node.inert = true;
      if (control instanceof HTMLButtonElement || control instanceof HTMLSelectElement) control.disabled = true;
    }
  }
}
