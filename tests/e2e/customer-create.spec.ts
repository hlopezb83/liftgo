import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Crear cliente desde la UI (happy path).
 *
 * Flujo real:
 *  1. /customers
 *  2. Click "Agregar Cliente" → abre CustomerFormDialog
 *  3. Llenar nombre + RFC genérico XAXX010101000 (sin lookup SAT)
 *  4. Guardar
 *  5. Verificar en BD que el registro quedó marcado como E2E y limpiarlo
 *
 * No usa el fixture `seed`: crea su propio cliente con prefijo "E2E UI" para
 * que el cleanup post-test pueda borrarlo por nombre vía el JWT del usuario logueado.
 */
test.setTimeout(60_000);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

test("create a customer through the UI with E2E isolation", async ({ page }) => {
  const customerName = `E2E UI ${Date.now()}`;
  const e2eScope = `customer-create-${Date.now()}`;

  await page.addInitScript((scope) => {
    window.localStorage.setItem("liftgo:e2e", "true");
    window.localStorage.setItem("liftgo:e2e_scope", scope);
  }, e2eScope);

  await page.goto("/customers", { waitUntil: "domcontentloaded" });
  // Fuentes ahora se cargan non-blocking (v7.39.0). Esperar `document.fonts.ready`
  // evita clicks pre-hidratación en runners lentos de CI.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});

  await page.getByRole("button", { name: /agregar cliente/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });

  await dialog.getByLabel(/nombre/i).first().fill(customerName);

  const rfcInput = dialog.getByLabel(/rfc/i).first();
  if ((await rfcInput.count()) > 0) await rfcInput.fill("XAXX010101000");

  const emailInput = dialog.getByLabel(/email|correo/i).first();
  if ((await emailInput.count()) > 0) await emailInput.fill("e2e-ui@test.local");

  await dialog.getByRole("button", { name: /agregar cliente|guardar|crear|registrar/i }).last().click();

  // El dialog se cierra al éxito; el cliente debe aparecer en la lista.
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // Teardown obligatorio: el cliente nace marcado is_e2e=true desde la UI, por lo
  // que no aparece en la lista productiva y purge_e2e_data puede capturarlo.
  // Si falla, el test DEBE fallar para que la contaminación se detecte en CI.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY requeridos para teardown");
  }
  const token = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
          return parsed?.access_token ?? null;
        } catch {
          return null;
        }
      }
    }
    return null;
  });
  if (!token) throw new Error("No se encontró token de sesión para teardown");

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // try/finally: cualquier expect que falle aquí abajo NO debe impedir el
  // cleanup. Antes la verificación y el delete corrían en secuencia plana
  // y un expect fallido dejaba el cliente colgado en BD.
  let createdId: string | null = null;
  try {
    const { data: created, error: selectErr } = await client
      .from("customers")
      .select("id,is_e2e,e2e_scope")
      .eq("name", customerName)
      .single();
    if (selectErr) throw new Error(`Verificación E2E falló: ${selectErr.message}`);
    createdId = created.id;
    expect(created.is_e2e).toBe(true);
    expect(created.e2e_scope).toBe(e2eScope);
  } finally {
    // Borrado directo por id (rápido) + e2e_teardown por scope como red por
    // si la UI marcó filas colaterales con el mismo scope.
    if (createdId) {
      await client.from("customers").delete().eq("id", createdId);
    }
    await client.rpc("e2e_teardown", { p_scope: e2eScope });
  }
});
