import { expect, test, type Page } from "@playwright/test";
import packageJson from "../../package.json" with { type: "json" };
import { classifyConsoleError } from "./consoleNoise";
import { assertReleaseIdentity } from "../../scripts/release-identity.mjs";
import { guardReadOnlyApp } from "./readOnlyApp";

/**
 * Smoke de arranque contra el build REAL. No hay backend ni credenciales: se
 * ejercita solo lo que funciona sin sesión (pantallas de acceso), pero con
 * INTERACCIÓN, no solo carga. Un `pageerror` silencioso al hidratar o un
 * manejador de eventos que no se registra rompen la app y no los detecta
 * ningún otro check.
 */

/**
 * Instala los colectores de error. El texto del error de transporte de
 * Chromium no incluye la URL, así que la atribución sale de
 * `msg.location().url`; ver `consoleNoise.ts` para la regla completa.
 */
function collectErrors(
  page: Page,
  blocked: ReadonlySet<string>,
  blockedHostingScripts: ReadonlySet<string>,
  origin: string,
): { pageErrors: string[]; consoleErrors: string[] } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const verdict = classifyConsoleError(
      { text: msg.text(), url: msg.location().url || undefined },
      { origin, blocked, blockedHostingScripts },
    );
    if (!verdict.ignored) consoleErrors.push(verdict.diagnostic);
  });
  return { pageErrors, consoleErrors };
}

/** Comprobaciones comunes de arranque: SSR con contenido + hidratación real. */
async function expectBooted(page: Page, route: string, published: boolean): Promise<void> {
  await expect(page.locator("body")).not.toBeEmpty();
  // Hidratación: React monta y el script anti-parpadeo del tema se ejecuta.
  // Aquí es donde reventaba `__name is not defined`.
  await page.waitForLoadState("load");
  await expect(page.locator("html"), `tema aplicado en ${route}`).toHaveAttribute(
    "class",
    /light|dark/,
  );
  // MIME alone cannot detect HTML incorrectly labelled as text/css. Verify
  // the browser parsed a real first-party stylesheet and decoded local images.
  const resources = await page.evaluate(() => ({
    styled: [...document.styleSheets].some((sheet) =>
      sheet.href && new URL(sheet.href).origin === location.origin && sheet.cssRules.length > 0),
    brokenImages: [...document.images]
      .filter((img) => new URL(img.src).origin === location.origin && (!img.complete || img.naturalWidth === 0))
      .map((img) => new URL(img.src).pathname),
  }));
  expect(resources.styled, `CSS real aplicado en ${route}`).toBe(true);
  expect(resources.brokenImages, `imágenes locales válidas en ${route}`).toEqual([]);
  // Regresión: sideEffects:false eliminaba la inicialización del SDK en producción.
  // Se observa el cliente real; guardReadOnlyApp evita cualquier envío externo y cualquier mutación.
  const sentry = await page.evaluate(() => {
    type Client = { getOptions(): { release?: string; replaysOnErrorSampleRate?: number } };
    type Scope = { getClient(): Client | undefined };
    const carrier = (globalThis as unknown as { __SENTRY__?: Record<string, unknown> }).__SENTRY__;
    const version = carrier?.version as string | undefined;
    const state = carrier?.[version ?? ""] as { defaultCurrentScope?: Scope; stack?: Scope } | undefined;
    const client = state?.stack?.getClient() ?? state?.defaultCurrentScope?.getClient();
    return { version, active: !!client, release: client?.getOptions().release, replay: client?.getOptions().replaysOnErrorSampleRate };
  });
  expect(sentry.active, `Sentry activo tras hidratar ${route}`).toBe(true);
  // A published deployment can lag main legitimately. Do not compare its
  // dependency version to the checkout used by this hourly workflow.
  const identity = await page.evaluate(async () => {
    const response = await fetch("/version.json", { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`version.json HTTP ${response.status}`);
    return {
      manifest: await response.json(),
      bundle: (globalThis as unknown as { __LIFTGO_SOURCE_ID__?: string }).__LIFTGO_SOURCE_ID__,
    };
  });
  const sourceSha256 = published ? process.env.LIFTGO_EXPECTED_SOURCE_ID : undefined;
  const version = published ? process.env.LIFTGO_EXPECTED_VERSION : undefined;
  // Either both expectations are explicit or neither: never infer approval
  // from the same deployment under test or from a newer main checkout.
  const expected = sourceSha256 || version ? { sourceSha256: sourceSha256 ?? "", version: version ?? "" } : undefined;
  assertReleaseIdentity(identity.manifest, identity.bundle, expected);
  expect(sentry.release, "bundle y version.json pertenecen a la misma versión").toBe(`liftgo@${identity.manifest.version}`);
  if (published) expect(sentry.version).toMatch(/^\d+\.\d+\.\d+$/);
  else expect(sentry.version).toBe(packageJson.dependencies["@sentry/react"]);
  expect(sentry.release).toMatch(/^liftgo@\d+\.\d+\.\d+$/);
  expect(sentry.replay).toBe(0);
}

test("acceso de empleados: carga, alterna contraseña y cambia de modo", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const { blocked, blockedHostingScripts, problems, assets } = await guardReadOnlyApp(context, origin);
  const published = testInfo.config.metadata.publishedSmoke === true;
  const { pageErrors, consoleErrors } = collectErrors(page, blocked, blockedHostingScripts, origin);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "status de /").toBeLessThan(400);
  await expectBooted(page, "/", published);

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

  // Recarga: segunda hidratación desde cero; routing desactiva la caché HTTP
  // para que vuelva a comprobar los assets y el formulario responda.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectBooted(page, "/ (recarga)", published);
  const reloaded = page.locator("#auth-password");
  await expect(reloaded).toBeVisible({ timeout: 30_000 });
  await reloaded.fill("clave-de-prueba");
  await expect(reloaded).toHaveValue("clave-de-prueba");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(reloaded).toHaveAttribute("type", "text");

  expect(problems, "solo lecturas públicas y assets válidos").toEqual([]);
  expect([...assets].some((asset) => /\.m?js$/.test(asset)), "JavaScript del build cargado").toBe(true);
  expect([...assets].some((asset) => asset.endsWith(".css")), "CSS del build cargado").toBe(true);
  expect(pageErrors, "errores de página en /").toEqual([]);
  expect(consoleErrors, "errores de consola en /").toEqual([]);
});

test("portal de clientes: carga y navega entre modos del formulario", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const { blocked, blockedHostingScripts, problems, assets } = await guardReadOnlyApp(context, origin);
  const published = testInfo.config.metadata.publishedSmoke === true;
  const { pageErrors, consoleErrors } = collectErrors(page, blocked, blockedHostingScripts, origin);

  const response = await page.goto("/portal/login", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "status de /portal/login").toBeLessThan(400);
  await expectBooted(page, "/portal/login", published);

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
  await expectBooted(page, "/portal/login (recarga)", published);
  const reloaded = page.locator("#auth-password");
  await expect(reloaded).toBeVisible({ timeout: 30_000 });
  await reloaded.fill("clave-de-prueba");
  await expect(reloaded).toHaveValue("clave-de-prueba");

  // Public navigation only: no submit, recovery email, login, or auth fixture.
  await page.getByRole("button", { name: "Acceso empleados", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("button", { name: "Mostrar contraseña", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(`${origin}/portal/login`);
  await expect(page.getByText("Portal de clientes", { exact: true })).toBeVisible();
  await expect(page.locator("#auth-password")).toBeVisible();

  expect(problems, "solo lecturas públicas y assets válidos").toEqual([]);
  expect([...assets].some((asset) => /\.m?js$/.test(asset)), "JavaScript del build cargado").toBe(true);
  expect([...assets].some((asset) => asset.endsWith(".css")), "CSS del build cargado").toBe(true);
  expect(pageErrors, "errores de página en /portal/login").toEqual([]);
  expect(consoleErrors, "errores de consola en /portal/login").toEqual([]);
});
