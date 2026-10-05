/** Content growth never changes intent. Only the reader leaving / returning to the end does. */
export function readingIntent(following: boolean, input: { kind: "away" } | { kind: "scroll"; atBottom: boolean; movedUp: boolean } | { kind: "latest" }): boolean {
  if (input.kind === "latest") return true;
  if (input.kind === "away") return false;
  if (input.movedUp) return false;
  return input.atBottom ? true : following;
}
