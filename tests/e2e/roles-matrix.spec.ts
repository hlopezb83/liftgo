import { test, expect, type Page } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";
import { applyApiSession, signInViaApi, supabaseEnv } from "./fixtures/apiAuth";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Matriz de roles — valida que cada rol ve/no ve las acciones destructivas
 * según `role_permissions`.
 *
 * Requiere env vars por rol; las credenciales ausentes hacen fallar la suite:
 *   E2E_VENTAS_EMAIL / E2E_VENTAS_PASSWORD
 *   E2E_ADMINISTRATIVO_EMAIL / E2E_ADMINISTRATIVO_PASSWORD
 *   E2E_MECANICO_EMAIL / E2E_MECANICO_PASSWORD
 *
 * La matriz sólo se considera verificada cuando TODOS sus roles se ejecutan.
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
  // Fase 4: login por API + inyección del storageState del rol (cacheado por
  // `global.setup.ts` cuando las credenciales existen). Ya no dependemos del
  // form de login para cada rol.
  await applyApiSession(page, email, password);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Iniciar Sesión" })).toHaveCount(0, {
    timeout: TIMEOUTS.long,
  });
}

async function cleanupRoleInvoice(client: SupabaseClient, id: string | undefined): Promise<void> {
  if (!id) return;
  const removed = await client.from("invoices").delete().eq("id", id).select("id");
  expect(removed.error).toBeNull();
  expect(removed.data).toEqual([{ id }]);
}

for (const role of ROLES) {
  test.describe(`Rol ${role.key}`, () => {
    test.beforeAll(() => {
      if (!role.email || !role.password) throw new Error("Faltan credenciales obligatorias para " + role.key);
    });

    test.use({ storageState: { cookies: [], origins: [] } });

    test(`${role.key} ve rutas permitidas y no ve acciones prohibidas`, async ({ page }) => {
      await loginAs(page, role.email!, role.password!);

      for (const path of role.canSee) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main, [role='main']").first()).toBeVisible({ timeout: TIMEOUTS.medium });
        await expect(page.getByText(/no autorizado|acceso denegado/i)).toHaveCount(0);
      }

      await page.goto("/invoices", { waitUntil: "domcontentloaded" });
      for (const rx of role.cannotAct) {
        await expect(page.getByRole("button", { name: rx })).toHaveCount(0);
      }
    });
  });
}

test("todos los roles de la matriz tienen credenciales", () => {
  expect(ROLES.every((role) => role.email && role.password)).toBe(true);
});

test("mecánico rechaza un INSERT válido por permisos, no por payload", async () => {
  const email = process.env.E2E_MECANICO_EMAIL;
  const password = process.env.E2E_MECANICO_PASSWORD;
  const adminEmail = process.env.E2E_TEST_EMAIL;
  const adminPassword = process.env.E2E_TEST_PASSWORD;
  if (!email || !password || !adminEmail || !adminPassword) throw new Error("Faltan identidades obligatorias");
  const { url, anonKey } = supabaseEnv();
  const adminSession = await signInViaApi(adminEmail, adminPassword);
  const mechanicSession = await signInViaApi(email, password);
  const client = (token: string) => createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const admin = client(adminSession.access_token);
  const mechanic = client(mechanicSession.access_token);
  const scope = "roles-" + Date.now();
  const seed = await admin.rpc("e2e_seed_scenario", { p_scope: scope });
  expect(seed.error).toBeNull();
  let positiveId: string | undefined;
  try {
    const invoice = await admin.from("invoices").select("organization_id").eq("id", seed.data.invoice_id).single();
    expect(invoice.error).toBeNull();
    const membership = await mechanic.from("organization_memberships").select("organization_id").eq("auth_user_id", mechanicSession.user.id).single();
    expect(membership.error).toBeNull();
    expect(membership.data?.organization_id).toBe(invoice.data?.organization_id);
    const payload = { organization_id: invoice.data?.organization_id, customer_id: seed.data.customer_id,
      invoice_number: "ROLE-" + scope, subtotal: 1, total: 1, status: "draft" };
    const positive = await admin.from("invoices").insert(payload).select("id").single();
    expect(positive.error).toBeNull();
    expect(positive.data?.id).toBeTruthy();
    positiveId = positive.data?.id as string | undefined;
    const denied = await mechanic.from("invoices").insert({ ...payload, invoice_number: "DENIED-" + scope });
    expect(denied.error?.code).toBe("42501");
    const after = await admin.from("invoices").select("id").eq("invoice_number", "DENIED-" + scope);
    expect(after.error).toBeNull();
    expect(after.data).toEqual([]);
  } finally {
    await cleanupRoleInvoice(admin, positiveId);
    const cleanup = await admin.rpc("e2e_teardown", { p_scope: scope });
    expect(cleanup.error).toBeNull();
  }
});
