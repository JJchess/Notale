import type { FilmDocument } from '@notale/format/film';
import type { DeckDocument } from '../domain/model.js';
/** A film as the editor stores it: the document envelope the browser and the server both save. */
export function filmEnvelope(film: FilmDocument): DeckDocument {
  return { schemaVersion: 1, kind: 'film', id: film.id, title: film.title, width: film.width, height: film.height, slides: [], film, theme: {}, layouts: [], assets: {}, comments: [], presentation: { loop: false, showSlideNumber: true } } as DeckDocument;
}
