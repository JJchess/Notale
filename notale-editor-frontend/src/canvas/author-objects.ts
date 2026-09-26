export interface AuthorObject {
  id: string;
  tag: string;
  namespace: string;
  parent?: string;
  text: string;
  html: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  locked: boolean;
  kind: string;
}
type ParsedObject = Omit<AuthorObject, 'locked' | 'kind'>;

/** Parsing depends on authored HTML, not geometry, animation or save revisions. */
export class AuthorObjects {
  private entries = new Map<string, {html: string; objects: ParsedObject[]}>();

  constructor(private capacity = 3) {}

  read(documentId: string, slide: {id: string; html: string; locked: string[]}, previous: AuthorObject[]): AuthorObject[] {
    const key = JSON.stringify([documentId, slide.id]);
    let entry = this.entries.get(key);
    if (!entry || entry.html !== slide.html) {
      const document = new DOMParser().parseFromString(slide.html, 'text/html');
      const excluded = new Set(['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'LINK', 'META']);
      const objects = [...document.querySelectorAll<HTMLElement>('[data-notale-id]')]
        .filter(element => !excluded.has(element.tagName))
        .map(element => ({
          id: element.dataset.notaleId!,
          tag: element.tagName.toLowerCase(),
          namespace: element.namespaceURI ?? '',
          parent: element.parentElement?.getAttribute('data-notale-id') ?? undefined,
          text: element.textContent ?? '',
          html: element.outerHTML,
          attributes: Object.fromEntries([...element.attributes].map(attribute => [attribute.name, attribute.value])),
          style: Object.fromEntries([...element.style].map(property => [property, element.style.getPropertyValue(property) + (element.style.getPropertyPriority(property) ? ' !important' : '')])),
        }));
      entry = {html: slide.html, objects};
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    const kinds = new Map(previous.map(object => [object.id, object.kind]));
    const locked = new Set(slide.locked);
    // Consumers may own drafts; never expose mutable cache records to them.
    return entry.objects.map(object => ({...object, attributes: {...object.attributes}, style: {...object.style}, locked: locked.has(object.id), kind: kinds.get(object.id) ?? 'element'}));
  }

  clear() { this.entries.clear(); }
}
