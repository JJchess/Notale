import { test } from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";
import { CHANGED, NEW, markChanges } from "../src/lib/live/page-diff";
import { FadeUp, Revealer } from "../src/lib/live/reveal";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html") as unknown as Document;
const page = (stage: string) => `<!doctype html><html><head><style>h1{color:red}</style></head><body><main id="stage">${stage}</main><script>1</script></body></html>`;
const marks = (html: string) => {
  const doc = parse(html);
  return { added: [...doc.querySelectorAll(`[${NEW}]`)].map(el => el.className || el.tagName), changed: [...doc.querySelectorAll(`[${CHANGED}]`)].map(el => el.className || el.tagName) };
};

test("new elements are marked once, at the outermost; changed ones by own text or attributes", () => {
  const before = page('<h1>标题</h1><div class="cards"><div class="card a"><p>一</p></div></div>');
  const after = page('<h1 style="color:green">标题</h1><div class="cards"><div class="card a"><p>一（改）</p></div><div class="card b"><p>二</p><p>三</p></div></div>');
  const result = markChanges(before, after, parse);
  assert.equal(result.added, 1);
  assert.equal(result.changed, 2);
  assert.deepEqual(marks(result.html), { added: ["card b"], changed: ["H1", "P"] });
  assert.match(result.html, /^<!doctype html>/i);
});

test("an unchanged page marks nothing; script and style edits are not content", () => {
  const before = page("<h1>一样</h1>");
  const result = markChanges(before, before.replace("1</script>", "2</script>").replace("red", "blue"), parse);
  assert.deepEqual([result.added, result.changed], [0, 0]);
});

test("a changed class is a change of the same element, not a new one", () => {
  const result = markChanges(page('<div class="x"><p>a</p></div>'), page('<div class="y"><p>a</p></div>'), parse);
  assert.deepEqual([result.added, result.changed], [0, 1]);
});

test("the revealer shows a new subtree box first, then its blocks, within the budget; finish shows the rest", async () => {
  const doc = parse(page(`<div class="card" ${NEW}><h3>年份</h3><div class="body"><p>正文</p><p>正文二</p></div></div>`));
  const waits: number[] = [];
  let release!: () => void;
  const revealer = new Revealer({ wait: ms => { waits.push(ms); return waits.length < 3 ? Promise.resolve() : new Promise(done => { release = done; }); } });
  const playing = revealer.play(doc, FadeUp, { budgetMs: 100, stepMs: 120 });
  await new Promise(done => setTimeout(done, 0));
  // card, h3, .body, p, p: five to show; 100 ms / 5 = 20 ms apart.
  assert.deepEqual(waits, [20, 20, 20]);
  assert.equal(doc.querySelector(".card")!.hasAttribute(NEW), false);
  assert.equal(revealer.pending, 2);
  revealer.finish();
  release();
  await playing;
  assert.equal(doc.querySelectorAll("[data-live-hidden]").length, 0);
  assert.equal(revealer.pending, 0);
});
