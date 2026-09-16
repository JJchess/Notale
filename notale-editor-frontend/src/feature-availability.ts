/** Product gates: keep unfinished integrations out of the user-facing editor.
 * These are UI release gates, not authorization checks. The underlying backend
 * APIs and development workbench retain their existing capabilities.
 * Remove a gate only with recorded integration evidence for its workflow.
 */
export const unavailableFeature = {
  hidden: true,
  inert: true,
  'data-editor-unavailable': 'true',
} as const;
