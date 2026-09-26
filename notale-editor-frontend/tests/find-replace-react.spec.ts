import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ baseURL: process.env.ARCHITECTURE_URL ?? "http://127.0.0.1:4399" });
test("React find replaces literal text across pages and rejects stale results", async ({
  page,
}) => {
  const id = randomUUID();
  expect(
    (
      await page.request.post("/api/documents", {
        data: {
          schemaVersion: 1,
          id,
          title: "查找编辑",
          width: 1600,
          height: 900,
          slides: ["first", "second"].map((id) => ({
            id,
            name: id,
            sourcePath: id + ".html",
            html: `<html><body><p data-notale-id="${id}-text">Hello hello</p></body></html>`,
          })),
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/?document=" + id, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      (window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length ===
      2,
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.keyboard.press("Control+h");
  await expect(page.locator("#find-replace-dialog")).toBeVisible();
  await page.locator("#find-query").fill("hello");
  await expect(page.locator("#find-results button")).toHaveCount(2);
  await page.locator("#find-replacement").fill("$& $1");
  await page.locator("#find-replace-all").click();
  await expect(page.locator("#find-status")).toHaveText("已替换 2 处");
  await page.locator("#find-close").click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  const read = async () =>
    await page.request.get("/api/documents/" + id).then((r) => r.json());
  let saved = await read();
  for (const slide of saved.document.slides)
    expect(slide.html).toContain("$&amp; $1 $&amp; $1");
  await page.locator("#undo").click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  saved = await read();
  for (const slide of saved.document.slides)
    expect(slide.html).toContain("Hello hello");
  await page.keyboard.press("Control+h");
  await page.locator("#find-query").fill("Hello");
  await page.locator("#find-case").check();
  await page.evaluate(() =>
    (window as any).NotaleWorkbench.commands([
      {
        type: "element.patch",
        slideId: "first",
        target: "first-text",
        patch: { text: "Hello remote" },
      },
    ]),
  );
  await page.locator("#find-replace-all").click();
  await expect(page.locator("#find-status")).toContainText("页面已变化");
  await expect(page.locator("#find-replacement")).toHaveValue("$& $1");
  await page.getByRole("button", { name: "重新查找", exact: true }).click();
  await page.locator("#find-replacement").fill("Updated");
  await page.locator("#find-replace-all").click();
  await expect(page.locator("#find-status")).toHaveText("已替换 2 处");
  await page.locator("#find-close").click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  saved = await read();
  expect(saved.document.slides[0].html).toContain("Updated remote");
  expect(saved.document.slides[1].html).toContain("Updated hello");
});
test("find replaces text spanning inline formats without flattening surrounding markup", async ({
  page,
}) => {
  const id = randomUUID();
  expect(
    (
      await page.request.post("/api/documents", {
        data: {
          schemaVersion: 1,
          id,
          title: "格式化文字查找",
          width: 1600,
          height: 900,
          slides: [
            {
              id: "first",
              name: "first",
              sourcePath: "first.html",
              html: '<html><body><p data-notale-id="rich"><strong data-notale-id="bold">Hel</strong><em data-notale-id="italic">lo</em> and <u data-notale-id="underline">Hello</u></p><p data-notale-id="generated"><code data-notale-id="code" data-notale-code="Hello" data-notale-code-lang="text">Hello</code><span data-notale-id="equation" data-notale-tex="Hello">Hello</span></p></body></html>',
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/?document=" + id, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    (window as any).NotaleWorkbench?.getSnapshot(),
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.keyboard.press("Control+h");
  await page.locator("#find-query").fill("Hello");
  await expect(page.locator("#find-results button")).toHaveCount(1);
  await page.locator("#find-replacement").fill("$&");
  await page.locator("#find-replace-all").click();
  await expect(page.locator("#find-status")).toHaveText("已替换 1 处");
  await page.locator("#find-close").click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  const rich = page.frameLocator("#canvas").locator('[data-notale-id="rich"]');
  await expect(rich).toHaveText("$& and $&");
  await expect(rich.locator("strong")).toHaveText("$&");
  await expect(rich.locator("u")).toHaveText("$&");
  const saved = await page.request.get("/api/documents/"+id).then(r=>r.json());
  expect(saved.document.slides[0].html).toContain('data-notale-code="Hello"');
  expect(saved.document.slides[0].html).toContain('data-notale-tex="Hello"');
  await page.locator("#undo").click();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  await expect(rich.locator("strong")).toHaveText("Hel");
  await expect(rich.locator("em")).toHaveText("lo");
});
