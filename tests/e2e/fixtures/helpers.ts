import type { Page } from "@playwright/test";

/**
 * Devuelve el access_token guardado por Supabase en localStorage tras un login
 * exitoso. Útil para llamar Edge Functions desde tests E2E sin volver a
 * loguearse vía API.
 *
 * Antes vivía duplicado en invoice-payment.spec.ts y portal.spec.ts; ahora
 * cualquier spec puede `import { getAuthToken } from "./helpers"`.
 */
export async function getAuthToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("sb-")) continue;
      try {
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { access_token?: string };
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // ignore malformed entry, keep scanning
      }
    }
    return null;
  });
}

/**
 * Falla el test si aparece un toast de error visible en la página. Usar al
 * final de un flujo "happy path" para asegurar que no hubo errores silenciosos.
 */
export async function expectNoToastError(page: Page): Promise<void> {
  const toastError = page.locator('[data-sonner-toast][data-type="error"]');
  // No esperamos un timeout largo: si ya hubo un error, ya está renderizado.
  if (await toastError.count() > 0) {
    const txt = (await toastError.first().textContent()) ?? "";
    throw new Error(`Toast de error inesperado: ${txt}`);
  }
}
