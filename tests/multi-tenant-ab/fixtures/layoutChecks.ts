import { expect, type Locator, type Page } from "@playwright/test";

/** Verifica layout calculado por Chromium, no sólo las clases CSS. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth
    - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

export async function expectInsideViewport(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("No se pudo medir la vista");
  // Radix y Sonner entran desde fuera de pantalla. Esperar el layout final,
  // conservando el límite de 1 px; un desbordamiento persistente sí falla.
  await expect.poll(async () => {
    const bounds = await target.boundingBox();
    if (!bounds) return Infinity;
    return Math.max(-bounds.x, -bounds.y,
      bounds.x + bounds.width - viewport.width,
      bounds.y + bounds.height - viewport.height);
  }, { message: "El elemento debe caber completamente tras su animación" }).toBeLessThanOrEqual(1);
}

export async function expectActionUncovered(target: Locator): Promise<void> {
  // actionability comprueba visibilidad, hit testing y overlays sin enviar el formulario.
  await target.click({ trial: true });
}
