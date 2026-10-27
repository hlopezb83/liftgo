import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { billNumber, getGroupCTransportLedgers, installGroupCTransport, type FixtureProfile } from "./fixtures";
import { evidenceRoot } from "./paths";
import { closeOfflinePages } from "../offlineTeardown";

mkdirSync(evidenceRoot, { recursive: true });
const test = base.extend<{ profile: FixtureProfile; audit: Awaited<ReturnType<typeof installGroupCTransport>> }>({
  profile: [{}, { option: true }],
  audit: [async ({ context, baseURL, profile }, use, info) => {
    const transport = await installGroupCTransport(context, new URL(baseURL!).origin, profile);
    await use(transport);
    const teardownErrors = await closeOfflinePages(context);
    const transports = getGroupCTransportLedgers(context);
    writeFileSync(`${evidenceRoot}/${info.project.name}-${info.title.replace(/\W+/g, "-")}-network.json`, JSON.stringify({ phase: "after-pages-closed", transports, teardownErrors }, null, 2));
    for (const ledger of transports) {
      expect.soft(ledger.unexpected).toEqual([]); expect.soft(ledger.pageErrors).toEqual([]);
    }
    expect(teardownErrors).toEqual([]);
  }, { auto: true }],
});

async function openBill(page: Page) {
  await page.goto("/cuentas-por-pagar");
  await page.getByText(billNumber, { exact: true }).first().click();
  const sheet = page.getByRole("dialog", { name: billNumber, exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function assertNoOverflow(root: Locator) {
  const widths = await root.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

async function closeSheetAndAssertReturnFocus(page: Page, sheet: Locator) {
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/cuentas-por-pagar$/);
  // A current row/card or the page-owned actions button is a meaningful
  // return target. BODY and a disconnected/hidden dialog are failures.
  await expect.poll(() => page.evaluate(number => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body || active === document.documentElement || active.closest('[role="dialog"]')) return false;
    const rect = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    const identifiesContext = active.textContent?.includes(number) || active.textContent?.includes("Más acciones");
    return Boolean(identifiesContext && rect.width && rect.height && style.visibility === "visible");
  }, billNumber)).toBe(true);
}

for (const currency of ["MXN", "USD"] as const) {
  test.describe(`supplier payment real app ${currency}`, () => {
    test.use({ profile: { currency } });

    test("keeps currency amount guards and focus through payment and Sheet close", async ({ page }, info) => {
      const sheet = await openBill(page);
      const paymentAction = sheet.getByRole("button", { name: "Registrar pago", exact: true });
      await expect(paymentAction).toBeInViewport();
      await expect(sheet.getByRole("region", { name: `Saldo de ${billNumber}` })).toContainText(currency);
      await assertNoOverflow(sheet);
      await assertNoOverflow(sheet.locator(".overflow-y-auto").first());
      await paymentAction.click();
      const payment = page.getByRole("dialog", { name: /Registrar pago/ });
      const amount = payment.getByLabel(/Monto/);
      await amount.blur();
      await expect(amount).toHaveValue("1,234,567,890.12");
      await expect(amount.locator("..").getByText(currency, { exact: true })).toBeVisible();
      await assertNoOverflow(payment);
      await page.screenshot({ path: `${evidenceRoot}/${info.project.name}-supplier-real-${currency}.png`, animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(payment).toBeHidden();
      await expect(paymentAction).toBeFocused();

      await paymentAction.click();
      await amount.fill("1234567890.13");
      await amount.blur();
      await payment.getByRole("button", { name: "Registrar pago", exact: true }).click();
      await expect(payment.getByText("El monto no puede ser mayor al saldo", { exact: true })).toBeVisible();
      await expect(amount).toBeFocused();
      const focusedBounds = await amount.evaluate(element => {
        const dialog = element.closest('[role="dialog"]')!;
        const header = dialog.querySelector('[class*="sticky"][class*="top-0"]')!.getBoundingClientRect();
        const footer = dialog.querySelector('[class*="sticky"][class*="bottom-0"]')!.getBoundingClientRect();
        const field = element.getBoundingClientRect();
        return { fieldTop: field.top, fieldBottom: field.bottom, headerBottom: header.bottom, footerTop: footer.top };
      });
      writeFileSync(`${evidenceRoot}/${info.project.name}-supplier-real-${currency}-error-focus.json`, JSON.stringify(focusedBounds, null, 2));
      expect(focusedBounds.fieldTop).toBeGreaterThanOrEqual(focusedBounds.headerBottom - 1);
      expect(focusedBounds.fieldBottom).toBeLessThanOrEqual(focusedBounds.footerTop + 1);
      await page.screenshot({ path: `${evidenceRoot}/${info.project.name}-supplier-real-${currency}-amount-error.png`, animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog", { name: "¿Descartar cambios?" })).toBeVisible();
      await page.getByRole("button", { name: "Seguir editando", exact: true }).click();
      await amount.blur();
      await expect(amount).toHaveValue("1,234,567,890.13");
      await payment.getByRole("button", { name: "Cancelar", exact: true }).click();
      await page.getByRole("button", { name: "Descartar", exact: true }).click();
      await expect(payment).toBeHidden();
      await expect(paymentAction).toBeFocused();
      await closeSheetAndAssertReturnFocus(page, sheet);
    });
  });
}

test.describe("supplier approval gate real app", () => {
  test.use({ profile: { approval: "pending", currency: "USD" } });

  test("explains blocked payment and never opens a payment form", async ({ page }, info) => {
    const sheet = await openBill(page);
    const paymentAction = sheet.getByRole("button", { name: "Registrar pago", exact: true });
    await expect(paymentAction).toHaveAttribute("aria-disabled", "true");
    await expect(paymentAction).toHaveAttribute("data-block-code", "supplier_bill_pending_approval");
    await paymentAction.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page.getByRole("dialog", { name: /Registrar pago/ })).toHaveCount(0);
    await page.screenshot({ path: `${evidenceRoot}/${info.project.name}-supplier-pending-approval.png`, animations: "disabled" });
    await assertNoOverflow(sheet);
  });
});

test.describe("supplier read permission real app", () => {
  test.use({ profile: { payablesAccess: "read", currency: "MXN" } });

  test("retains invoice context while hiding write controls", async ({ page }, info) => {
    const sheet = await openBill(page);
    await expect(page.getByRole("button", { name: "Nueva factura", exact: true })).toHaveCount(0);
    for (const name of ["Registrar pago", "Editar", "Cancelar registro", "Eliminar"]) {
      await expect(sheet.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(sheet.getByRole("region", { name: `Saldo de ${billNumber}` })).toContainText("MXN");
    await assertNoOverflow(sheet);
    await page.screenshot({ path: `${evidenceRoot}/${info.project.name}-supplier-read-only.png`, animations: "disabled" });
    await closeSheetAndAssertReturnFocus(page, sheet);
  });
});
