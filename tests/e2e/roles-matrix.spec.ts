import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./fixtures/helpers";

/**
 * Matriz de roles — valida que cada rol ve/no ve las acciones destructivas
 * según `role_permissions`.
 *
 * Requiere env vars por rol (opcional; se saltan si no están definidos):
 *   E2E_VENTAS_EMAIL / E2E_VENTAS_PASSWORD
 *   E2E_ADMINISTRATIVO_EMAIL / E2E_ADMINISTRATIVO_PASSWORD
 *   E2E_MECANICO_EMAIL / E2E_MECANICO_PASSWORD
 *
 * TESTS-ARQ2 (v7.220.0 DIFF 15): centinela abajo garantiza que si TODAS las
 * credenciales faltan el archivo NO queda como "0 tests" verdes silenciosos.
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

// TESTS-ARQ2 (v7.220.0 DIFF 15): centinela — si NINGÚN rol tiene credenciales
// exponemos el hecho como test que se skipea con motivo explícito (visible en
// el report), en vez de un archivo con 0 tests que pasa en silencio.
test("centinela: al menos un rol con credenciales configuradas", () => {
  const any = ROLES.some((r) => r.email && r.password);
  // eslint-disable-next-line playwright/no-skipped-test -- centinela: skip explícito visible en el report cuando ningún rol tiene credenciales
  test.skip(!any, "Ningún E2E_<ROL>_EMAIL/PASSWORD configurado — matriz de roles se saltó completa.");
  expect(any).toBe(true);
});

// v7.223.0 · DIFF 15 residual: denegación a nivel API. La UI puede ocultar
// botones pero si el mecánico intercepta y POST-ea `/rest/v1/invoices`
// directamente, RLS debe rechazar (401/403). Guarda contra regresiones donde
// alguien afloje la policy pensando "el botón está oculto de todos modos".
test.describe("Rol mecánico — denegación API-level (RLS)", () => {
  // eslint-disable-next-line playwright/no-skipped-test -- Skip explícito cuando faltan credenciales.
  test.skip(
    !process.env.E2E_MECANICO_EMAIL || !process.env.E2E_MECANICO_PASSWORD,
    "Faltan credenciales E2E_MECANICO_*",
  );
  test.use({ storageState: { cookies: [], origins: [] } });

  test("mecánico no puede insertar en /rest/v1/invoices", async ({ page }) => {
    await loginAs(page, process.env.E2E_MECANICO_EMAIL!, process.env.E2E_MECANICO_PASSWORD!);

    // Ejecutamos el POST desde el contexto del navegador para heredar el
    // Authorization del cliente Supabase hidratado en `window`.
    const status = await page.evaluate(async () => {
      // @ts-expect-error inyectado por el cliente Supabase en runtime
      const { supabase } = (await import("/src/integrations/supabase/client.ts")) as {
        supabase: { auth: { getSession: () => Promise<{ data: { session: { access_token: string } | null } }> } };
      };
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return 0;

      const url = `${(window as unknown as { __SUPABASE_URL__?: string }).__SUPABASE_URL__ ?? ""}/rest/v1/invoices`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: (window as unknown as { __SUPABASE_ANON__?: string }).__SUPABASE_ANON__ ?? "",
          Authorization: `Bearer ${token}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          customer_id: "00000000-0000-0000-0000-000000000000",
          invoice_number: "MECANICO-ATTACK",
          total: 1,
          subtotal: 1,
        }),
      });
      return res.status;
    });

    // RLS bloquea con 401/403; PostgREST también puede responder 409/400 si
    // la fila viola constraints antes de evaluar RLS. Lo importante es que
    // NUNCA sea 2xx.
    expect(status, "mecánico NO debe poder insertar facturas").toBeGreaterThanOrEqual(400);
  });
});
