import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken, waitForSupabaseResponse, TIMEOUTS } from "./fixtures/helpers";

/**
 * Crear cliente desde la UI (happy path).
 *
 * Flujo real:
 *  1. /customers
 *  2. Click "Agregar Cliente" → abre CustomerFormDialog
 *  3. Llenar nombre + RFC genérico XAXX010101000 (sin lookup SAT)
 *  4. Guardar
 *  5. Verificar en BD que el registro quedó marcado como E2E y limpiarlo
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

  // Diagnóstico defensivo: si un pageerror o console.error dispara durante el
  // submit, queda en el log de CI para acortar el próximo debug loop.
   
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
   
  page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text()); });

  await page.goto("/customers", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: /agregar cliente/i }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: TIMEOUTS.medium });

  await dialog.getByLabel(/nombre/i).first().fill(customerName);

  const rfcInput = dialog.getByLabel(/rfc/i).first();
  if ((await rfcInput.count()) > 0) await rfcInput.fill("XAXX010101000");

  const emailInput = dialog.getByLabel(/email|correo/i).first();
  if ((await emailInput.count()) > 0) await emailInput.fill("e2e-ui@test.local");

  // Espera dirigida al INSERT del cliente en lugar de networkidle (que tragaba
  // timeouts reales). El submit dispara POST /rest/v1/customers.
  const [insertResp] = await Promise.all([
    waitForSupabaseResponse(page, /\/rest\/v1\/customers(\?|$)/, TIMEOUTS.long),
    dialog.getByRole("button", { name: /agregar cliente|guardar|crear|registrar/i }).last().click(),
  ]);
  expect(insertResp.status(), "POST /customers debe responder 2xx").toBeLessThan(400);

  try {
    await expect(dialog).toBeHidden({ timeout: TIMEOUTS.long });
  } catch (err) {
    const alerts = await page.locator('[role="alert"], .text-destructive, [data-sonner-toast]').allTextContents();
     
    console.log("[customer-create] dialog still visible. Alerts:", JSON.stringify(alerts));
    throw err;
  }

  // Teardown obligatorio (BD).
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY requeridos para teardown");
  }
  const token = await getAuthToken(page);
  if (!token) throw new Error("No se encontró token de sesión para teardown");

  const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

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
    if (createdId) {
      await client.from("customers").delete().eq("id", createdId);
    }
    await client.rpc("e2e_teardown", { p_scope: e2eScope });
  }
});
