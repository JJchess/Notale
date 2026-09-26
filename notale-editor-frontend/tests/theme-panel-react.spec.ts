import { test, expect } from "@playwright/test";
import {reveal} from './harness/format-panel';
import { randomUUID } from "node:crypto";
test.use({ baseURL: process.env.ARCHITECTURE_URL ?? "http://127.0.0.1:4399" });
test("React theme presets and fonts autosave while preserving unrelated variables", async ({
  page,
}) => {
  const id = randomUUID();
  expect(
    (
      await page.request.post("/api/documents", {
        data: {
          schemaVersion: 1,
          id,
          title: "主题编辑",
          width: 1600,
          height: 900,
          theme: { "--custom": "preserve" },
          slides: [
            {
              id: "first",
              name: "第一页",
              sourcePath: "first.html",
              html: '<html><body><p data-notale-id="text">主题样本</p></body></html>',
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
  await page.locator('[data-tool="style"]').click();
  await reveal(page,"#deck-theme");await expect(page.locator("#deck-theme")).toBeVisible();
  const theme = async () =>
    await page.request
      .get("/api/documents/" + id)
      .then((r) => r.json())
      .then((r) => r.document.theme);
  await page.locator('[data-theme-preset="2"]').click();
  await expect.poll(async () => (await theme())["--model"]).toBe("#1F7A5C");
  await expect(page.locator('[data-theme-preset="2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect((await theme())["--custom"]).toBe("preserve");
  const beforeCancel = await page.request
    .get("/api/documents/" + id)
    .then((r) => r.json())
    .then((r) => r.version);
  expect(typeof beforeCancel).toBe("number");
  await page.locator("#theme-font").fill("cancelled draft");
  await page.waitForTimeout(220);
  expect((await theme())["font-family"]).toBeUndefined();
  await expect(page.locator("#theme-font")).toBeFocused();
  await page.locator("#theme-font").press("Escape");
  await expect(page.locator("#theme-font")).toHaveValue("");
  await page.waitForTimeout(220);
  expect(
    await page.request
      .get("/api/documents/" + id)
      .then((r) => r.json())
      .then((r) => r.version),
  ).toBe(beforeCancel);
  await page.locator("#theme-font").fill("Georgia");
  await page.locator("#theme-font").press("Enter");
  await expect.poll(async () => (await theme())["font-family"]).toBe("Georgia");
  await expect(page.locator("#deck-theme")).toBeEnabled();
  await page.locator("#theme-font").fill("Arial");
  await page.locator("#theme-font").press("Tab");
  await expect.poll(async () => (await theme())["font-family"]).toBe("Arial");
  await expect(page.locator("#deck-theme")).toBeEnabled();
  await page.locator("#theme-font").fill("");
  await page.locator("#theme-font").press("Enter");
  await expect.poll(async () => (await theme())["font-family"]).toBeUndefined();
  await page.locator('[data-theme-token="--model"]').fill("#654321");
  await expect.poll(async () => (await theme())["--model"]).toBe("#654321");
  await expect(page.locator('[data-theme-preset="2"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      (window as any).NotaleWorkbench?.getSnapshot()?.document.slides.length ===
      1,
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  if (
    (await page.locator('[data-tool="style"]').getAttribute("aria-pressed")) !==
    "true"
  )
    await page.locator('[data-tool="style"]').click();
  await expect(page.locator('[data-theme-token="--model"]')).toHaveValue(
    "#654321",
  );
});
