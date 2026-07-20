import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./fixtures/helpers";

/**
 * Matriz de roles — valida que cada rol ve/no ve las acciones destructivas
 * según `role_permissions`.
 *
 * Requiere env vars por rol (opcional; se saltan si no están definidos):
 *   E2E_VENTAS_EMAIL / E2E_VENTAS_PASSWORD
 *   E2E_ADMIN_EMAIL_ADMINISTRATIVO / E2E_ADMINISTRATIVO_PASSWORD
 *   E2E_MECANICO_EMAIL / E2E_MECANICO_PASSWORD
 */
type RoleFixture = {
  key: string;
  email: string | undefined;
  password: string | undefined;
  /** Rutas que el rol PUEDE ver sin toast de error. */
  canSee: string[];
  /** Botones/labels que NO deben aparecer en /invoices para este rol. */
  cannotAct: RegExp[];
};

const ROLES: RoleFixture[] = [
  {
    key: "ventas",
    email: process.env.E2E_VENTAS_EMAIL,
    password: process.env.E2E_VENTAS_PASSWORD,
    canSee: ["/quotes", "/customers"],
    // Ventas no puede eliminar facturas ni configurar empresa.
    cannotAct: [/eliminar factura/i, /configuración de empresa/i],
  },
  {
    key: "administrativo",
    email: process.env.E2E_ADMINISTRATIVO_EMAIL,
    password: process.env.E2E_ADMINISTRATIVO_PASSWORD,
    canSee: ["/invoices", "/cuentas-por-pagar", "/mrr"],
    // Administrativo no puede eliminar rentas cerradas.
    cannotAct: [/eliminar reserva cerrada/i],
  },
  {
    key: "mecanico",
    email: process.env.E2E_MECANICO_EMAIL,
    password: process.env.E2E_MECANICO_PASSWORD,
    canSee: ["/maintenance", "/fleet"],
    cannotAct: [/nueva factura/i, /timbrar/i],
  },
];

async function loginAs(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toBeVisible({
    timeout: 15_000,
  });
  await signIn(page, email, password);
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });
}

for (const role of ROLES) {
  test.describe(`Rol ${role.key}`, () => {
    // eslint-disable-next-line playwright/no-skipped-test -- Skip condicional por credenciales de rol ausentes; permite correr la matriz parcialmente en CI.
    test.skip(!role.email || !role.password, `Faltan credenciales E2E_${role.key.toUpperCase()}_*`);

    test.use({ storageState: { cookies: [], origins: [] } });

    test(`${role.key} ve rutas permitidas y no ve acciones prohibidas`, async ({ page }) => {
      await loginAs(page, role.email!, role.password!);

      for (const path of role.canSee) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main, [role='main']").first()).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText(/no autorizado|acceso denegado/i)).toHaveCount(0);
      }

      await page.goto("/invoices", { waitUntil: "domcontentloaded" });
      for (const rx of role.cannotAct) {
        await expect(page.getByRole("button", { name: rx })).toHaveCount(0);
      }
    });
  });
}
