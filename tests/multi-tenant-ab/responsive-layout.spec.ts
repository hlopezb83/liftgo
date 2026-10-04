import { test, expect } from "./fixtures/staffScenario";
import { expectActionUncovered, expectInsideViewport, expectNoHorizontalOverflow } from "./fixtures/layoutChecks";

for (const width of [390, 768, 1440]) {
  test("formularios, detalle y modal de pago caben a " + width + " px", async ({ page, scenario }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/quotes/new");
    await expect(page.getByRole("heading", { name: "Nueva cotización" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const save = page.getByRole("button", { name: "Crear cotización", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expectActionUncovered(save);
    await page.goto("/invoices/" + scenario.ids.invoice_id);
    await expect(page.getByText(scenario.ids.invoice_number).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByTestId("invoice-register-payment").click();
    const dialog = page.getByTestId("record-payment-dialog");
    await expectInsideViewport(page, dialog);
    await dialog.getByLabel(/monto del pago/i).fill("0");
    const submit = page.getByTestId("record-payment-submit");
    await submit.scrollIntoViewIfNeeded();
    await expectActionUncovered(submit);
    await submit.click();
    const toast = page.locator("[data-sonner-toast]").last();
    await expectInsideViewport(page, toast);
    await expectActionUncovered(submit);
    await expectNoHorizontalOverflow(page);
    await dialog.getByRole("button", { name: /cancelar/i }).click();
  });
}
