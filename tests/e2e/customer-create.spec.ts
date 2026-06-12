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

  // Teardown: borrar el cliente creado vía el JWT del usuario autenticado en la página.
  // Si falla, el test no se rompe (best-effort) pero el nombre tiene prefijo "E2E UI"
  // para que la limpieza semanal lo identifique.
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
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
      if (token) {
        const client = createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        await client.from("customers").delete().eq("name", customerName);
      }
    } catch {
      // best-effort
    }
  }
});
