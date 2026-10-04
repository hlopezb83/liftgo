import { expect, type Locator, type Page } from "@playwright/test";

/** Verifica layout calculado por Chromium, no sólo las clases CSS. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth
    - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

export async function expectInsideViewport(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const bounds = await target.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) throw new Error("No se pudo medir la vista");
  expect(bounds.x).toBeGreaterThanOrEqual(-1);
  expect(bounds.y).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}

export async function expectActionUncovered(target: Locator): Promise<void> {
  // actionability comprueba visibilidad, hit testing y overlays sin enviar el formulario.
  await target.click({ trial: true });
}
