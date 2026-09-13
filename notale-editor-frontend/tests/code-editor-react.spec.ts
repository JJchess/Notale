import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ baseURL: process.env.ARCHITECTURE_URL ?? "http://127.0.0.1:4399" });
test("React code editing previews, saves, and retains conflicting drafts", async ({
  page,
}) => {
  const id = randomUUID();
  expect(
    (
      await page.request.post("/api/documents", {
        data: {
          schemaVersion: 1,
          id,
          title: "代码编辑验证",
          width: 1600,
          height: 900,
          slides: [
            {
              id: "first",
              name: "第一页",
              sourcePath: "first.html",
              html: '<html><body><pre data-notale-id="code" data-notale-code="print(1)" data-notale-code-lang="python">print(1)</pre></body></html>',
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/?document=" + id, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      (window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length ===
      1,
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.evaluate(() => (window as any).NotaleWorkbench.select("code"));
  await page.locator("#open-code-editor").click();
  await expect(page.locator("#code-source")).toBeFocused();
  const before = await page.request
    .get("/api/documents/" + id)
    .then((r) => r.json());
  await page.locator("#save-code").click();
  await expect(page.locator("#code-editor-dialog")).toHaveCount(0);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  const unchanged = await page.request
    .get("/api/documents/" + id)
    .then((r) => r.json());
  expect(typeof unchanged.version).toBe("number");
  expect(unchanged.version).toBe(before.version);
  expect(unchanged.document.slides).toEqual(before.document.slides);
  await page.locator("#open-code-editor").click();
  await page.locator("#code-language").selectOption("javascript");
  await page.locator("#code-source").fill("const x = 2;");
  await expect(page.locator("#code-preview")).toHaveText("const x = 2;");
  expect(await page.locator("#code-preview span").count()).toBeGreaterThan(0);
  await page.locator("#code-source").press("Control+s");
  await expect(page.locator("#code-editor-dialog")).toHaveCount(0);
  await expect(
    page.frameLocator("#canvas").locator('[data-notale-id="code"]'),
  ).toHaveAttribute("data-notale-code", "const x = 2;");
  await page.locator("#open-code-editor").click();
  await expect(page.locator("#code-language")).toHaveValue("javascript");
  await page.locator("#code-source").fill("const draft = 3;");
  await page.evaluate(() =>
    (window as any).NotaleWorkbench.commands([
      {
        type: "element.patch",
        slideId: "first",
        target: "code",
        patch: { attributes: { "data-notale-code": "remote" } },
      },
    ]),
  );
  await page.locator("#save-code").click();
  await expect(
    page.locator('#code-editor-dialog [role="status"]'),
  ).toContainText("代码已变化");
  await expect(page.locator("#code-source")).toHaveValue("const draft = 3;");
  await page.locator("#cancel-code").click();
  await page.locator("#open-code-editor").click();
  await expect(page.locator("#code-source")).toHaveValue("remote");
  await page.locator("#code-language").selectOption("plain");
  await page.locator("#code-source").fill("<script>alert(1)</script>");
  await expect(page.locator("#code-preview script")).toHaveCount(0);
  await page.locator("#save-code").click();
  await expect(page.locator("#code-editor-dialog")).toHaveCount(0);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  const saved = await page.request
    .get("/api/documents/" + id)
    .then((r) => r.json());
  expect(saved.document.slides[0].html).toContain("&lt;script&gt;");
});
