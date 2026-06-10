import { test, expect } from "@playwright/test";

/**
 * Create a customer happy path.
 *
 * Does NOT use the seed fixture (creates its own customer through the UI
 * and cleans up via teardown). We rely on the generic RFC XAXX010101000 so
 * no SAT lookup is needed. We mark the customer name with the E2E prefix
 * so a manual cleanup is easy if the test is interrupted.
 */
test("create a customer through the UI and find it in the list", async ({ page }) => {
  const customerName = `E2E UI ${Date.now()}`;

  await page.goto("/customers/new", { waitUntil: "domcontentloaded" });

  const nameInput = page.getByLabel(/nombre/i).first();
  await nameInput.fill(customerName);

  const rfcInput = page.getByLabel(/rfc/i).first();
  if ((await rfcInput.count()) > 0) await rfcInput.fill("XAXX010101000");

  const emailInput = page.getByLabel(/email|correo/i).first();
  if ((await emailInput.count()) > 0) await emailInput.fill("e2e-ui@test.local");

  await page.getByRole("button", { name: /guardar|crear|registrar/i }).first().click();

  // Either land on the customer detail page or have the name visible in the list.
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.getByText(customerName).first()).toBeVisible({ timeout: 15_000 });
});
