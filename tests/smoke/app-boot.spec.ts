import { expect, test, type Page, type Route } from "@playwright/test";
import { classifyConsoleError, normalizeUrl } from "./consoleNoise";

/**
 * Smoke de arranque contra el build REAL. No hay backend ni credenciales: se
 * ejercita solo lo que funciona sin sesión (pantallas de acceso), pero con
 * INTERACCIÓN, no solo carga. Un `pageerror` silencioso al hidratar o un
 * manejador de eventos que no se registra rompen la app y no los detecta
 * ningún otro check.
 */

/**
 * Corta cualquier petición que salga del origen EXACTO de la app. El build del
 * smoke apunta a un Supabase inexistente a propósito; esto garantiza además
 * que la prueba no puede tocar un backend real ni depender de red.
 *
 * Solo se bloquea red externa: los scripts y assets de la aplicación se sirven
 * y se ejecutan tal cual salen del empaquetado. Devuelve el conjunto de URLs
 * abortadas (normalizadas) para poder correlacionar el ruido de transporte con
 * una causa demostrable.
 */
async function blockExternalRequests(page: Page, origin: string): Promise<Set<string>> {
  const blocked = new Set<string>();
  await page.route("**/*", (route: Route) => {
    const url = route.request().url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    let sameOrigin = false;
    try {
      sameOrigin = new URL(url).origin === origin;
    } catch {
      sameOrigin = false;
    }
    if (sameOrigin) return route.continue();
    blocked.add(normalizeUrl(url));
    return route.abort();
  });
  return blocked;
}

/**
 * Instala los colectores de error. El texto del error de transporte de
 * Chromium no incluye la URL, así que la atribución sale de
 * `msg.location().url`; ver `consoleNoise.ts` para la regla completa.
 */
function collectErrors(
  page: Page,
  blocked: ReadonlySet<string>,
  origin: string,
): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const verdict = classifyConsoleError(
      { text: msg.text(), url: msg.location().url || undefined },
      { origin, blocked },
    );
    if (!verdict.ignored) consoleErrors.push(verdict.diagnostic);
  });
  return { pageErrors, consoleErrors };
}



/** Comprobaciones comunes de arranque: SSR con contenido + hidratación real. */
async function expectBooted(page: Page, route: string): Promise<void> {
  await expect(page.locator("body")).not.toBeEmpty();
  // Hidratación: React monta y el script anti-parpadeo del tema se ejecuta.
  // Aquí es donde reventaba `__name is not defined`.
  await page.waitForLoadState("load");
  await expect(page.locator("html"), `tema aplicado en ${route}`).toHaveAttribute(
    "class",
    /light|dark/,
  );
}

test("acceso de empleados: carga, alterna contraseña y cambia de modo", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const blocked = await blockExternalRequests(page, origin);
  const { pageErrors, consoleErrors } = collectErrors(page, blocked, origin);


  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "status de /").toBeLessThan(400);
  await expectBooted(page, "/");

  // Sin sesión la app resuelve a la pantalla de acceso interno.
  const password = page.locator("#auth-password");
  await expect(password).toBeVisible({ timeout: 30_000 });
  await expect(password).toHaveAttribute("type", "password");

  // Interacción 1: el botón mostrar/ocultar cambia el tipo del campo. Prueba
  // que el manejador quedó enlazado tras hidratar.
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(password).toHaveAttribute("type", "password");

  // Interacción 2: cambio de modo del formulario (estado de React + re-render).
  await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  await expect(page.getByText("Restablecer Contraseña")).toBeVisible();
  await expect(password).toHaveCount(0);
  await page.getByRole("button", { name: "Volver a Iniciar Sesión" }).click();
  await expect(page.locator("#auth-password")).toBeVisible();

  // Recarga: segunda hidratación desde cero (assets ya cacheados, otro camino
  // de arranque) y el formulario debe volver a responder.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectBooted(page, "/ (recarga)");
  const reloaded = page.locator("#auth-password");
  await expect(reloaded).toBeVisible({ timeout: 30_000 });
  await reloaded.fill("clave-de-prueba");
  await expect(reloaded).toHaveValue("clave-de-prueba");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(reloaded).toHaveAttribute("type", "text");

  expect(pageErrors, "errores de página en /").toEqual([]);
  expect(consoleErrors, "errores de consola en /").toEqual([]);

});

test("portal de clientes: carga y navega entre modos del formulario", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const blocked = await blockExternalRequests(page, origin);
  const { pageErrors, consoleErrors } = collectErrors(page, blocked, origin);


  const response = await page.goto("/portal/login", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "status de /portal/login").toBeLessThan(400);
  await expectBooted(page, "/portal/login");

  await expect(page.getByText("Portal de clientes")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#auth-password")).toBeVisible();

  // Interacción: alternar a "recuperar contraseña" oculta el campo de
  // contraseña y cambia el título; volver lo restaura.
  await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  await expect(page.getByText("Restablecer contraseña")).toBeVisible();
  await expect(page.locator("#auth-password")).toHaveCount(0);
  await page.getByRole("button", { name: "Volver a iniciar sesión" }).click();
  await expect(page.locator("#auth-password")).toBeVisible();

  // Recarga: el portal debe volver a hidratar y aceptar interacción.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectBooted(page, "/portal/login (recarga)");
  const reloaded = page.locator("#auth-password");
  await expect(reloaded).toBeVisible({ timeout: 30_000 });
  await reloaded.fill("clave-de-prueba");
  await expect(reloaded).toHaveValue("clave-de-prueba");

  expect(pageErrors, "errores de página en /portal/login").toEqual([]);
  expect(consoleErrors, "errores de consola en /portal/login").toEqual([]);

});
