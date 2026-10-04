import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/staffScenario";
import { expectNoToastError } from "../e2e/fixtures/helpers";

async function submitPayment(page: Page, amount: number): Promise<void> {
  const dialog = page.getByTestId("record-payment-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/monto del pago/i).fill(String(amount));
  const response = page.waitForResponse((res) => res.url().includes("/rest/v1/payments")
    && res.request().method() === "POST");
  await page.getByTestId("record-payment-submit").click();
  expect((await response).ok()).toBe(true);
  await expect(dialog).toBeHidden();
  await expectNoToastError(page);
}

test("pago parcial UI → saldo persistido → pago final UI sin sobrepago", async ({ page, scenario }) => {
  const { client, ids } = scenario;
  await page.goto("/invoices/" + ids.invoice_id);
  await expect(page.getByText(ids.invoice_number).first()).toBeVisible();
  await page.getByTestId("invoice-register-payment").click();
  await submitPayment(page, ids.total / 2);
  const partial = await client.from("payments").select("amount").eq("invoice_id", ids.invoice_id);
  expect(partial.error).toBeNull();
  expect(partial.data).toHaveLength(1);
  if (!partial.data) throw new Error("Falta pago parcial");
  expect(Number(partial.data[0].amount)).toBe(ids.total / 2);
  const invoice = await client.from("invoices").select("status").eq("id", ids.invoice_id).single();
  expect(invoice.error).toBeNull();
  expect(invoice.data?.status).not.toBe("paid");
  await page.reload();
  await page.getByTestId("invoice-register-payment").click();
  const dialog = page.getByTestId("record-payment-dialog");
  await expect(dialog.getByLabel(/monto del pago/i)).toHaveValue(String((ids.total / 2).toFixed(2)));
  await submitPayment(page, ids.total / 2);
  const paid = await client.from("invoices").select("status").eq("id", ids.invoice_id).single();
  expect(paid.error).toBeNull();
  expect(paid.data?.status).toBe("paid");
  const payments = await client.from("payments").select("amount").eq("invoice_id", ids.invoice_id);
  expect(payments.error).toBeNull();
  expect(payments.data).toHaveLength(2);
  if (!payments.data) throw new Error("Faltan pagos persistidos");
  expect(payments.data.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(ids.total);
  await expect(page.getByTestId("invoice-register-payment")).toHaveCount(0);
});
