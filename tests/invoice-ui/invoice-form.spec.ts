import { expect, type Page } from "@playwright/test";
import { test } from "../mobile/mobileTest";
import { invoiceCustomerName } from "../mobile/offlineDispatcher";

test.use({ profile: "invoice" });

async function addConcept(page: Page, index: number, description: string, quantity: string, price: string) {
  await page.getByRole("button", { name: "Agregar Fila", exact: true }).click();
  await page.getByRole("textbox", { name: `Descripción partida ${index}`, exact: true }).fill(description);
  await page.getByRole("spinbutton", { name: `Cantidad partida ${index}`, exact: true }).fill(quantity);
  await page.getByRole("spinbutton", { name: `Precio unitario partida ${index}`, exact: true }).fill(price);
}

test("captura local de Nueva factura con datos ficticios", async ({ page, mockBackend }, info) => {
  await page.goto("/invoices/new");
  await expect(page.getByRole("heading", { name: "Nueva factura", exact: true })).toBeVisible();
  await expect(page.getByText("QA-FAC-001", { exact: true })).toBeVisible();
  // Use the customer selector UI rather than importing or mutating form state.
  await page.getByRole("combobox", { name: /Cliente/ }).click();
  await page.getByRole("option", { name: new RegExp(invoiceCustomerName) }).click();
  await addConcept(page, 1, "Renta de montacargas ficticio QA — servicio mensual", "2", "1250");
  await addConcept(page, 2, "Entrega ficticia QA y recolección del equipo", "1", "500");
  await expect(page.getByRole("status", { name: "Importe neto partida 1" })).toHaveText(/2,500/);
  await expect(page.getByRole("status", { name: "Importe neto partida 2" })).toHaveText(/500/);
  await page.getByRole("heading", { name: "Nueva factura", exact: true }).scrollIntoViewIfNeeded();
  const phase = process.env.INVOICE_CAPTURE_PHASE ?? "after";
  await page.screenshot({ path: info.outputPath(`${phase}-header.png`) });
  await page.getByRole("textbox", { name: "Descripción partida 1", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath(`${phase}-concepts.png`) });
  if (phase !== "before") {
    for (const index of [1, 2]) {
      await page.getByRole("group", { name: `Partida ${index}`, exact: true }).screenshot({ path: info.outputPath(`${phase}-concept-${index}.png`) });
    }
    await page.getByRole("combobox", { name: "Unidad SAT partida 2", exact: true }).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: info.outputPath(`${phase}-concept-2-lower.png`) });
    await page.getByRole("complementary", { name: "Resumen de importes", exact: true }).evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: info.outputPath(`${phase}-summary.png`) });
  }
  expect(mockBackend.observed.has("organization_customers")).toBe(true);
  expect(mockBackend.observed.has("invoices")).toBe(true);
});
