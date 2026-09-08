import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Smoke de arranque contra el build REAL. No hay backend ni credenciales: se
 * ejercita solo lo que funciona sin sesión (pantallas de acceso), pero con
 * INTERACCIÓN, no solo carga. Un `pageerror` silencioso al hidratar o un
 * manejador de eventos que no se registra rompen la app y no los detecta
 * ningún otro check.
 */

/** Destino ficticio con el que se compiló el bundle del smoke. */
const FAKE_BACKEND_HOST = "127.0.0.1:54321";

/**
 * Corta cualquier petición que salga del origen EXACTO de la app. El build del
 * smoke apunta a un Supabase inexistente a propósito; esto garantiza además
 * que la prueba no puede tocar un backend real ni depender de red.
 *
 * Solo se bloquea red externa: los scripts y assets de la aplicación se sirven
 * y se ejecutan tal cual salen del empaquetado. Devuelve la lista de URLs
 * abortadas para poder distinguir su ruido del de un asset propio roto.
 */
async function blockExternalRequests(page: Page, origin: string): Promise<string[]> {
  const blocked: string[] = [];
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
    blocked.push(url);
    return route.abort();
  });
  return blocked;
}

/**
 * Ruido esperado: solo el atribuible al backend ficticio o a una petición
 * externa que ESTA prueba abortó. Un `Failed to load resource` o un
 * `net::ERR_*` de un script o asset propio de la app SÍ debe hacer fallar: es
 * exactamente el tipo de fallo de empaquetado que este smoke persigue.
 */
function isExpectedBackendNoise(text: string, blocked: string[]): boolean {
  if (text.includes(FAKE_BACKEND_HOST)) return true;
  if (/AuthRetryableFetchError/.test(text)) return true;
  return blocked.some((url) => text.includes(url));
}

/** Instala los colectores de error y devuelve las listas para aserción final. */
function collectErrors(
  page: Page,
  blocked: string[],
): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isExpectedBackendNoise(msg.text(), blocked)) {
      consoleErrors.push(msg.text());
    }
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
  const blocked = await blockExternalRequests(page, new URL(baseURL!).origin);
  const { pageErrors, consoleErrors } = collectErrors(page, blocked);


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
  const blocked = await blockExternalRequests(page, new URL(baseURL!).origin);
  const { pageErrors, consoleErrors } = collectErrors(page, blocked);


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

  expect(pageErrors, "errores de página en /portal/login").toEqual([]);
  expect(consoleErrors, "errores de consola en /portal/login").toEqual([]);
});
