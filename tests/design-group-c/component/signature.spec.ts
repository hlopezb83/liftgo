import { expect, test, type Locator } from "@playwright/test";
import { closeOfflinePages } from "../../offlineTeardown";
import { getComponentTransportLedgers, installComponentTransport } from "./transport";

// Existing isolated component server/proxy and CI job; no app/backend mounts.
test.use({ deviceScaleFactor: 2, hasTouch: true });

test.afterEach(async ({ context }) => {
  const errors = await closeOfflinePages(context);
  for (const ledger of getComponentTransportLedgers(context)) {
    expect.soft(ledger.errors).toEqual([]);
    expect.soft(ledger.unexpected).toEqual([]);
    expect.soft(ledger.externalBlocked).toEqual([]);
  }
  expect(errors).toEqual([]);
});

async function inkPixels(canvas: Locator) {
  return canvas.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    const rgba = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i] < 100 && rgba[i + 3] > 0) ink++;
    return ink;
  });
}

test("signature real pixels survive DPR resize and export PNG; undo and disabled remain safe", async ({ context, page }) => {
  await installComponentTransport(context);
  await page.goto("/tests/design-group-c/component/index.html?view=signature");
  const canvas = page.getByLabel("Firma del cliente");
  await expect(canvas).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar Firma" })).toBeDisabled();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Signature canvas has no layout");
  await page.mouse.move(rect.x + 20, rect.y + 20);
  await page.mouse.down();
  await page.mouse.move(rect.x + 100, rect.y + 80, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => inkPixels(canvas)).toBeGreaterThan(20);
  await page.getByRole("button", { name: "Cambiar ancho" }).click();
  await expect.poll(() => canvas.evaluate(c => c.getBoundingClientRect().width)).toBeLessThan(rect.width);
  const expectedPixels = await canvas.evaluate(c => Math.round(c.getBoundingClientRect().width * devicePixelRatio));
  await expect.poll(() => canvas.evaluate(c => (c as HTMLCanvasElement).width)).toBe(expectedPixels);
  await expect.poll(() => inkPixels(canvas)).toBeGreaterThan(10);
  await page.getByRole("button", { name: "Alternar bloqueo" }).click();
  for (const name of ["Deshacer", "Limpiar", "Confirmar Firma"]) await expect(page.getByRole("button", { name })).toBeDisabled();
  await page.getByRole("button", { name: "Alternar bloqueo" }).click();
  await page.getByRole("button", { name: "Confirmar Firma" }).click();
  const png = page.getByAltText("Firma PNG confirmada");
  await expect(png).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect.poll(() => png.evaluate(i => (i as HTMLImageElement).naturalWidth)).toBe(expectedPixels);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(() => inkPixels(canvas)).toBe(0);
  await expect(page.getByRole("button", { name: "Confirmar Firma" })).toBeDisabled();
});

test("native touch tap draws a visible dot and clear resets it", async ({ context, page }) => {
  await installComponentTransport(context);
  await page.goto("/tests/design-group-c/component/index.html?view=signature");
  const canvas = page.getByLabel("Firma del cliente");
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Signature canvas has no layout");
  await page.touchscreen.tap(rect.x + 30, rect.y + 30);
  await expect.poll(() => inkPixels(canvas)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Limpiar" }).click();
  await expect.poll(() => inkPixels(canvas)).toBe(0);
  await expect(page.getByRole("button", { name: "Confirmar Firma" })).toBeDisabled();
});
