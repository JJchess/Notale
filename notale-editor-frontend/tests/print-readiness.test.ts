import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForPrintPages } from "../src/print-readiness";
function setup() {
  const sheet = new EventTarget(),
    frame = Object.assign(new EventTarget(), {
      src: "http://content.test/page.html",
      contentWindow: {},
    }),
    abort = new AbortController();
  const ready = (patch: Record<string, unknown> = {}) => {
    const event = Object.assign(new Event("message"), {
      source: frame.contentWindow,
      origin: "http://content.test",
      data: {
        source: "notale-slide",
        channel: "channel",
        type: "ready",
        data: { slideId: "page" },
      },
      ...patch,
    });
    sheet.dispatchEvent(event);
  };
  return { sheet, frame, abort, ready };
}
test("printing waits for load and a matching runtime, in either order", async () => {
  for (const order of ["load", "ready"]) {
    const { sheet, frame, abort, ready } = setup();
    let done = false;
    const pending = waitForPrintPages(
      sheet as any,
      [{ frame: frame as any, slideId: "page" }],
      "channel",
      abort.signal,
    ).then(() => {
      done = true;
    });
    if (order === "load") frame.dispatchEvent(new Event("load"));
    else ready();
    await Promise.resolve();
    assert.equal(done, false);
    ready({ origin: "http://wrong.test" });
    await Promise.resolve();
    assert.equal(done, false);
    if (order === "load") ready();
    else frame.dispatchEvent(new Event("load"));
    await pending;
    assert.equal(done, true);
  }
});
test("missing runtime readiness times out and aborted preparation rejects", async () => {
  const s = setup();
  const timed = waitForPrintPages(
    s.sheet as any,
    [{ frame: s.frame as any, slideId: "page" }],
    "channel",
    s.abort.signal,
    5,
  );
  s.frame.dispatchEvent(new Event("load"));
  await assert.rejects(timed, /部分页面/);
  const pending = waitForPrintPages(
    s.sheet as any,
    [{ frame: s.frame as any, slideId: "page" }],
    "channel",
    s.abort.signal,
  );
  s.abort.abort();
  await assert.rejects(pending, /取消/);
});

test('closing the print window cancels pending preparation',async()=>{const s=setup();const pending=waitForPrintPages(s.sheet as any,[{frame:s.frame as any,slideId:'page'}],'channel',s.abort.signal);s.sheet.dispatchEvent(new Event('pagehide'));await assert.rejects(pending,/导出窗口已关闭/);});
