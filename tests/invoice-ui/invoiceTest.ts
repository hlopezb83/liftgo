import { expect, type Locator, type Page } from "@playwright/test";
import { invoiceCustomerName } from "../mobile/offlineDispatcher";

export const description = (page: Page, index = 1) => page.getByRole("textbox", { name: `Descripción partida ${index}`, exact: true });
export const quantity = (page: Page, index = 1) => page.getByRole("spinbutton", { name: `Cantidad partida ${index}`, exact: true });
export const price = (page: Page, index = 1) => page.getByRole("spinbutton", { name: `Precio unitario partida ${index}`, exact: true });
export const net = (page: Page, index = 1) => page.getByRole("status", { name: `Importe neto partida ${index}`, exact: true });

export async function openNew(page: Page, fromList = false) {
  await page.goto(fromList ? "/invoices" : "/invoices/new");
  if (fromList) {
    await expect(page.getByText("No se encontraron facturas", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Nueva factura", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Nueva factura", exact: true })).toBeVisible();
  await expect(page.getByText("QA-FAC-001", { exact: true })).toBeVisible();
}

export async function selectCustomer(page: Page) {
  await page.getByRole("combobox", { name: /Cliente/ }).click();
  await page.getByRole("option", { name: new RegExp(invoiceCustomerName) }).click();
}

export async function addConcept(page: Page, index: number, text: string, count: string, amount: string) {
  await page.getByRole("button", { name: "Agregar Fila", exact: true }).click();
  await description(page, index).fill(text);
  await quantity(page, index).fill(count);
  await price(page, index).fill(amount);
}

// Discover through real sequential keyboard navigation rather than focus().
export async function tabTo(page: Page, target: Locator) {
  for (let attempt = 0; attempt < 35; attempt++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) break;
  }
  await expect(target).toBeFocused();
}
