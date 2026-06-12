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
 *  5. Verificar que el nombre aparece en la lista
 *
 * No usa el fixture `seed`: crea su propio cliente con prefijo "E2E UI" para
 * que el cleanup post-test pueda borrarlo por nombre vía el JWT del usuario logueado.
 */
test.setTimeout(60_000);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

test("create a customer through the UI and find it in the list", async ({ page }) => {
  const customerName = `E2E UI ${Date.now()}`;

  await page.goto("/customers", { waitUntil: "domcontentloaded" });

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
  await expect(page.getByText(customerName).first()).toBeVisible({ timeout: 15_000 });

  // Teardown obligatorio: marcamos primero is_e2e=true para que cualquier purga
  // posterior (purge_e2e_data) lo capture, y luego borramos por nombre. Si falla,
  // el test DEBE fallar para que la contaminación se detecte en CI, no en producción.
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
  // Marca como E2E (red de seguridad) antes de borrar.
  await client.from("customers").update({ is_e2e: true }).eq("name", customerName);
  const { error: delErr } = await client.from("customers").delete().eq("name", customerName);
  if (delErr) throw new Error(`Teardown falló: ${delErr.message}`);
});
