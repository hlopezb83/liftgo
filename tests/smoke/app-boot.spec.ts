import { expect, test } from "@playwright/test";

/**
 * Rutas públicas: se renderizan sin sesión. No se navega a rutas protegidas
 * porque el smoke corre sin backend (y sin credenciales) a propósito.
 */
const PUBLIC_ROUTES = ["/", "/portal/login"];

/**
 * Errores de red esperados: el build del smoke apunta a un Supabase que no
 * existe. Cualquier OTRO error de consola sí es señal de regresión.
 */
function isExpectedBackendNoise(text: string): boolean {
  return /Failed to fetch|net::ERR_|ECONNREFUSED|AuthRetryableFetchError|supabase/i.test(text);
}

for (const route of PUBLIC_ROUTES) {
  test(`arranca sin errores de página: ${route}`, async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isExpectedBackendNoise(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `status de ${route}`).toBeLessThan(400);

    // El HTML servido por SSR debe traer contenido real, no una cáscara vacía.
    await expect(page.locator("body")).not.toBeEmpty();

    // Hidratación: React monta y el script anti-parpadeo del tema se ejecuta.
    // Aquí es donde reventaba `__name is not defined`.
    await page.waitForLoadState("load");
    await expect(page.locator("html")).toHaveAttribute("class", /light|dark/);

    expect(pageErrors, `errores de página en ${route}`).toEqual([]);
    expect(consoleErrors, `errores de consola en ${route}`).toEqual([]);
  });
}
