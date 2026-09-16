import { test, expect } from "@playwright/test";
import {reveal} from './harness/format-panel';
import { randomUUID } from "node:crypto";
test.use({ baseURL: process.env.VECTOR_TEST_URL ?? "http://127.0.0.1:4332" });
test("vector object, path, gradient and structure edits share durable history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = randomUUID();
  const doc = {
    schemaVersion: 1,
    id,
    title: "矢量编辑验收",
    width: 1600,
    height: 900,
    slides: [
      {
        id: "page",
        name: "图形编辑",
        sourcePath: "page.html",
        html: '<!doctype html><html><head></head><body style="margin:0"><main id="stage" data-notale-id="stage" style="position:relative;width:1600px;height:900px"><svg data-notale-id="art" width="800" height="500" viewBox="0 0 800 500" style="position:absolute;left:120px;top:120px"><path data-notale-id="curve" d="M40 150C90 30 180 270 260 120" fill="none" stroke="#7450e9" stroke-width="8"/><rect data-notale-id="rect" x="320" y="80" width="140" height="120" fill="#38bdf8"/><circle data-notale-id="circle" cx="450" cy="170" r="70" fill="#a78bfa"/><text data-notale-id="label" x="40" y="360" font-size="36">集成学习</text></svg></main></body></html>',
      },
    ],
  };
  const response = await page.request.post("/api/documents", { data: doc });
  expect(response.status(), await response.text()).toBe(201);
  await page.goto("/?document=" + id);
  await page.waitForFunction(() => (window as any).NotaleWorkbench);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  const select = async (ids: string[]) =>
    page.evaluate(
      (ids) => (window as any).NotaleWorkbench.selectMany(ids),
      ids,
    );
  const saved = async () =>
    expect
      .poll(() =>
        page.evaluate(
          () => (window as any).NotaleWorkbench.getSyncState().pending,
        ),
      )
      .toBe(0);
  await page.locator('[data-tool="style"]').click();
  await select(["rect"]);await reveal(page,"#vector-properties");
  await expect(page.locator("#vector-properties")).toBeVisible();
  const frame = page.frameLocator("#canvas");
  await frame.locator("body").evaluate(() => {
    (window as any).__vectorSentinel = 42;
  });
  await page
    .locator("#vector-properties")
    .getByLabel("填充", { exact: true })
    .fill("#ef4444");
  await page
    .locator("#vector-properties")
    .getByLabel("填充", { exact: true })
    .press("Tab");
  await expect(frame.locator('[data-notale-id="rect"]')).toHaveCSS(
    "fill",
    "rgb(239, 68, 68)",
  );
  await saved();
  expect(
    await frame
      .locator("body")
      .evaluate(() => (window as any).__vectorSentinel),
  ).toBe(42);
  await page
    .locator("#vector-properties")
    .locator("summary")
    .filter({ hasText: /^渐变$/ })
    .click();
  await page
    .locator("#vector-properties")
    .getByRole("button", { name: "线性渐变", exact: true })
    .click();
  await saved();
  await expect(frame.locator("linearGradient")).toHaveCount(1);
  await select(["rect", "circle"]);
  await page
    .locator("#vector-properties")
    .getByRole("button", { name: "联合", exact: true })
    .click();
  await expect(
    frame.locator('[data-notale-vector-operation="union"]'),
  ).toHaveCount(1);
  await saved();
  expect(
    await frame
      .locator("body")
      .evaluate(() => (window as any).__vectorSentinel),
  ).toBe(42);
  const groupId = await frame
    .locator('[data-notale-vector-operation="union"]')
    .getAttribute("data-notale-id");
  await select([groupId!]);
  await page
    .locator("#vector-properties")
    .getByRole("button", { name: "编辑源形状", exact: true })
    .click();
  await expect(frame.locator('[aria-label="编辑顶点"]')).toBeVisible();
  await expect(
    frame.locator('[data-notale-vector-operation="union"] > path'),
  ).toBeVisible();
  await page
    .locator("#vector-properties")
    .getByRole("button", { name: "完成源形状编辑", exact: true })
    .click();
  await expect(frame.locator('[aria-label="编辑顶点"]')).toHaveCount(0);
  await select(["curve"]);
  await page
    .locator("#vector-properties")
    .getByRole("button", { name: "编辑顶点", exact: true })
    .click();
  await expect(frame.locator('[aria-label="编辑顶点"]')).toBeVisible();
  const point = await frame
    .locator("[data-node]")
    .first()
    .evaluate((n) => {
      const b = n.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
  const box = (await page.locator("#canvas").boundingBox())!;
  const size = await page
    .locator("#canvas")
    .evaluate((n) => ({
      w: (n as HTMLElement).offsetWidth,
      h: (n as HTMLElement).offsetHeight,
    }));
  await page.mouse.click(
    box.x + (point.x * box.width) / size.w,
    box.y + (point.y * box.height) / size.h,
  );
  await page.keyboard.press("ArrowRight");
  await expect(frame.locator('[data-notale-id="curve"]')).not.toHaveAttribute(
    "d",
    "M40 150C90 30 180 270 260 120",
  );
  await page.keyboard.press("Escape");
  await saved();
  await page.locator('#undo').click();
  await expect(frame.locator('[data-notale-id="curve"]')).toHaveAttribute('d','M40 150C90 30 180 270 260 120');
  await page.locator('#redo').click();
  await expect(frame.locator('[data-notale-id="curve"]')).not.toHaveAttribute('d','M40 150C90 30 180 270 260 120');
  await page.reload();
  await page.waitForFunction(() => (window as any).NotaleWorkbench);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await expect(
    page
      .frameLocator("#canvas")
      .locator('[data-notale-vector-operation="union"]'),
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});
