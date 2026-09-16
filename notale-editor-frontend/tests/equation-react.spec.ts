import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ baseURL: process.env.ARCHITECTURE_URL ?? "http://127.0.0.1:4399" });
test("React equation previews saves inline mode and preserves conflicting input", async ({
  page,
}) => {
  const id = randomUUID();
  expect(
    (
      await page.request.post("/api/documents", {
        data: {
          schemaVersion: 1,
          id,
          title: "公式编辑",
          width: 1600,
          height: 900,
          slides: [
            {
              id: "first",
              name: "第一页",
              sourcePath: "first.html",
              html: '<html><body><div data-notale-id="equation" data-notale-tex="x" data-notale-tex-display="1" style="font-size:72px;color:rgb(20, 40, 60)">x</div></body></html>',
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
  await page.evaluate(() => (window as any).NotaleWorkbench.select("equation"));
  await page.locator("#open-equation-editor").click();
  await expect(page.locator("#equation-tex")).toBeFocused();
  await page.locator("#equation-tex").evaluate(node => {
    for (const signal of [{isComposing:true}, {keyCode:229}]) {
      node.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', ctrlKey:true, bubbles:true, cancelable:true, ...signal}));
    }
  });
  await expect(page.locator("#equation-editor-dialog")).toBeVisible();
  await page.locator("#equation-tex").fill("\\frac{");
  await expect(page.locator("#save-equation")).toBeDisabled();
  await page.locator("#equation-tex").press("Control+Enter");
  await expect(page.locator("#equation-editor-dialog")).toBeVisible();
  await page.locator("#equation-tex").fill("x^2 + y^2");
  await expect(page.locator("#equation-preview .katex")).toHaveCount(1);
  await page.locator("#equation-inline").check();
  await page.locator("#equation-tex").press("Control+s");
  await expect(page.locator("#equation-editor-dialog")).toHaveCount(0);
  const equation = page
    .frameLocator("#canvas")
    .locator('[data-notale-id="equation"]');
  await expect(equation).toHaveAttribute("data-notale-tex", "x^2 + y^2");
  await expect(equation).toHaveAttribute("data-notale-tex-display", "0");
  await expect(equation).toHaveCSS("font-size", "72px");
  await expect(equation).toHaveCSS("color", "rgb(20, 40, 60)");
  await page.locator("#open-equation-editor").click();
  await expect(page.locator("#equation-inline")).toBeChecked();
  await page.locator("#equation-tex").fill("z^3");
  await page.evaluate(() =>
    (window as any).NotaleWorkbench.commands([
      {
        type: "element.patch",
        slideId: "first",
        target: "equation",
        patch: { attributes: { "data-notale-tex": "remote" } },
      },
    ]),
  );
  await page.locator("#save-equation").click();
  await expect(page.locator("#equation-status")).toContainText("公式已变化");
  await expect(page.locator("#equation-tex")).toHaveValue("z^3");
  await page.locator("#cancel-equation").click();
  await page.locator("#open-equation-editor").click();
  await expect(page.locator("#equation-tex")).toHaveValue("remote");
  await page.locator("#equation-tex").fill("z^3");
  await page.locator("#save-equation").click();
  await expect(page.locator("#equation-editor-dialog")).toHaveCount(0);
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  const saved = await page.request
    .get("/api/documents/" + id)
    .then((r) => r.json());
  expect(saved.document.slides[0].html).toContain('data-notale-tex="z^3"');
});
