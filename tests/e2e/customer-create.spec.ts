import { test, expect } from "@playwright/test";

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
 * que el cleanup manual sea trivial si la prueba se interrumpe.
 */
test.setTimeout(60_000);

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
});
