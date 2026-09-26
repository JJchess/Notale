import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test.use({ baseURL: process.env.ARCHITECTURE_URL ?? "http://127.0.0.1:4399" });
test("React teaching steps preserve drafts and edit, duplicate, move and remove steps", async ({
  page,
}) => {
  const id = randomUUID();
  expect(
    (
      await page.request.post("/api/documents", {
        data: {
          schemaVersion: 1,
          id,
          title: "Teaching",
          width: 1600,
          height: 900,
          slides: [
            {
              id: "page",
              name: "Page",
              sourcePath: "page.html",
              html: '<html><body><p data-notale-id="text">Hello</p></body></html>',
              steps: [
                {
                  id: "initial",
                  name: "Initial",
                  notes: "",
                  advanceAfter: null,
                },
                { id: "reveal", name: "Reveal", notes: "", advanceAfter: null },
              ],
            },
          ],
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/?document=" + id);
  await page.waitForFunction(() =>
    (window as any).NotaleWorkbench?.getSnapshot(),
  );
  await page.evaluate(() => (window as any).NotaleWorkbench.whenReady());
  await page.locator('[data-tool="animation"]').click();
  await page.locator(".animation-step-details > summary").click();
  await page.locator('[data-step-id="initial"]').focus();
  await page.locator('[data-step-id="initial"]').press("ArrowDown");
  await expect(page.locator('[data-step-id="reveal"]')).toBeFocused();
  await expect(page.locator("#teaching-name")).toHaveValue("Reveal");
  await page.locator("#teaching-notes").fill("discard");
  await page.locator("#teaching-notes").press("Escape");
  await expect(page.locator("#teaching-notes")).toHaveValue("");
  await page.locator("#teaching-name").fill("Explanation");
  await page.locator("#teaching-notes").fill("Speaker draft");
  await page.locator("#teaching-advance").fill("1.5");
  await page.evaluate(() =>
    (window as any).NotaleWorkbench.commands([
      { type: "deck.update", title: "Unrelated" },
    ]),
  );
  await expect(page.locator("#teaching-notes")).toHaveValue("Speaker draft");
  await page.locator("#teaching-notes").focus();
  await page.locator("#teaching-notes").press("Control+Enter");
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
  const read = async () =>
    page.request.get("/api/documents/" + id).then((r) => r.json());
  expect((await read()).document.slides[0].steps[1]).toMatchObject({
    name: "Explanation",
    notes: "Speaker draft",
    advanceAfter: 1500,
  });
  await page.locator("#teaching-duplicate").click();
  await expect(page.locator(".teaching-card")).toHaveCount(3);
  await expect(page.locator("#teaching-up")).toBeEnabled();
  await page.locator("#teaching-up").click();
  await expect(page.locator("#teaching-up")).toBeDisabled();
  await page.locator("#teaching-remove").click();
  await expect(page.locator(".teaching-card")).toHaveCount(2);
  await page.locator("#teaching-insert").click();
  await expect(page.locator(".teaching-card")).toHaveCount(3);
  await page.locator('[data-step-id="initial"]').click();
  await expect(page.locator("#teaching-remove")).toBeDisabled();
  await page.evaluate(() => (window as any).NotaleWorkbench.whenSynchronized());
});
