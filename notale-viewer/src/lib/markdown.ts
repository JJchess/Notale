import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

/** Raw HTML and unsafe link/image protocols remain disabled, including during partial streams. */
export function renderMarkdown(text: string): string {
  return micromark(text, { allowDangerousHtml: false, allowDangerousProtocol: false, extensions: [gfm()], htmlExtensions: [gfmHtml()] });
}
