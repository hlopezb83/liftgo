import { expect, type Page } from "@playwright/test";

/**
 * Devuelve el access_token guardado por Supabase en localStorage tras un login
 * exitoso. Útil para llamar Edge Functions y RPC desde tests E2E sin volver a
 * loguearse vía API.
 *
 * Fuente única: seed.ts, customer-create.spec.ts, invoice-payment.spec.ts y
 * portal.spec.ts consumían tres implementaciones distintas de esta lógica.
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
 * Espera activamente a que Supabase persista el `access_token` en localStorage.
 * Reemplaza el histórico `waitForTimeout(500)` de global.setup.ts que en
 * runners lentos generaba storageState sin sesión → suite entera en cascada.
 *
 * Poll cada 100ms hasta `timeoutMs` (default 30s). Falla loud si no llega.
 */
export async function waitForAuthToken(
  page: Page,
  timeoutMs = 30_000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const token = await getAuthToken(page);
    if (token) return token;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `[e2e] Supabase auth token no apareció en localStorage tras ${timeoutMs}ms. ` +
      "¿Falló el login o el redirect post-auth?",
  );
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

/**
 * Timeouts canónicos — evita magic numbers regados por 18 specs.
 * Ajustar aquí para escalar toda la suite en runners lentos.
 */
export const TIMEOUTS = {
  short: 5_000,
  medium: 10_000,
  long: 15_000,
  xl: 30_000,
  pdf: 45_000,
} as const;

/**
 * Espera dirigida a que un endpoint REST de Supabase responda 2xx. Reemplaza
 * `waitForLoadState("networkidle").catch(() => {})` que tragaba timeouts.
 *
 * @example
 *   await Promise.all([
 *     waitForSupabaseResponse(page, /rest\/v1\/invoices/),
 *     tab.click(),
 *   ]);
 */
export function waitForSupabaseResponse(
  page: Page,
  urlPattern: RegExp,
  timeoutMs = TIMEOUTS.medium,
) {
  return page.waitForResponse(
    (res) => urlPattern.test(res.url()) && res.status() < 400,
    { timeout: timeoutMs },
  );
}

/**
 * Assert helper: la app debe estar libre de `pageerror` y `console.error`
 * durante el flujo. Usar al final de specs "happy path" para catch de
 * regresiones silenciosas (uncaught promise, ErrorBoundary, etc.).
 *
 * Uso:
 *   const errs = collectPageErrors(page);
 *   // ...
 *   expect(errs).toEqual([]);
 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console] ${m.text()}`);
  });
  return errors;
}

/**
 * Login E2E vía UI usando selectors estables (id + data-testid). Reemplaza
 * las tres implementaciones ad-hoc en global.setup.ts, roles-matrix.spec.ts y
 * portal.spec.ts.
 *
 * NO espera redirección — el caller decide qué URL/rol esperar después.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
}

// Re-export para que specs no importen expect desde @playwright/test cuando
// ya están usando helpers.
export { expect };
