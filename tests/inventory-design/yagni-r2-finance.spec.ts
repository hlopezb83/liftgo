import { Buffer } from "node:buffer";
import { expect, test as base, type BrowserContext } from "@playwright/test";
import { customerId, installGroupCTransport, invoiceId, invoiceNumber } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const paymentReference = "QA-RASTREO-REINTENTO-123";
const errorTitle = "No se pudo cargar el listado de reportes de pago";
const reportedPayment = {
  id: "00000000-0000-4000-8000-000000000181", invoice_id: invoiceId, customer_id: customerId,
  amount: 500, transfer_date: "2026-11-01", tracking_key: paymentReference,
  status: "pending_review", sender_bank: "Banco QA ficticio", sender_last4: "1234",
  proof_url: null, review_notes: null,
};

async function installFinanceTransport(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const state = { mode: "empty" as "empty" | "fail" | "success", paymentReads: 0, uuidReads: 0 };
  let pendingRead: Promise<void> | undefined;
  let releaseRead = () => {};
  const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, OPTIONS" };
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split("/").pop();
    if (table === "supplier_bills" && request.method() === "GET" && url.searchParams.has("cfdi_uuid")) {
      state.uuidReads++;
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: "[]" });
    }
    if (table !== "customer_payment_intents") return route.fallback();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (request.method() !== "GET") return route.fallback();
    state.paymentReads++;
    await pendingRead;
    return route.fulfill({ status: state.mode === "fail" ? 500 : 200, headers: cors,
      contentType: "application/json", body: JSON.stringify(state.mode === "fail"
        ? { code: "FIXTURE_QUERY_ERROR", message: "Fallo ficticio al consultar reportes de pago" }
        : state.mode === "success" ? [reportedPayment] : []),
    });
  });
  return { audit, state,
    holdPaymentReads() { pendingRead = new Promise(resolve => { releaseRead = resolve; }); },
    releasePaymentReads() { releaseRead(); pendingRead = undefined; },
  };
}

const test = base.extend<{ transport: Awaited<ReturnType<typeof installFinanceTransport>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installFinanceTransport(context, new URL(baseURL!).origin);
    try {
      await use(transport);
    } finally {
      transport.releasePaymentReads();
      const teardownErrors = await closeOfflinePages(context);
      await info.attach("finance-offline-network", { contentType: "application/json", body: JSON.stringify({
        ...transport.audit, ...transport.state, teardownErrors,
      }, null, 2) });
      expect(transport.audit.unexpected).toEqual([]);
      expect(transport.audit.pageErrors).toEqual([]);
      const allowedBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
      expect(transport.audit.externalBlocked.filter(request => !allowedBlocked.has(request))).toEqual([]);
      expect(teardownErrors).toEqual([]);
    }
  }, { auto: true }],
});

test("CFDI rechaza EUR o moneda ausente sin reemplazar los importes capturados", async ({ page, transport }) => {
  await page.goto("/cuentas-por-pagar");
  await page.getByRole("button", { name: /Nueva factura/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nueva factura de proveedor", exact: true });
  const subtotal = dialog.getByLabel(/Subtotal/);
  await subtotal.fill("77");
  await subtotal.blur();
  for (const currency of ['Moneda="EUR" TipoCambio="23"', ""]) {
    const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
      TipoDeComprobante="I" Fecha="2026-11-01T10:00:00" ${currency} SubTotal="500" Total="500">
      <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"/></cfdi:Complemento></cfdi:Comprobante>`;
    await dialog.locator('input[type="file"]').setInputFiles({ name: "moneda-invalida.xml",
      mimeType: "application/xml", buffer: Buffer.from(xml) });
    await expect(dialog.getByText(currency
      ? 'Moneda del CFDI no soportada: "EUR". Solo se aceptan MXN y USD.'
      : "El CFDI no indica una moneda válida. Solo se aceptan MXN y USD.", { exact: true })).toBeVisible();
    await expect(subtotal).toHaveValue("77.00");
    await expect(dialog.getByText("CFDI cargado", { exact: true })).toHaveCount(0);
  }
  expect(transport.state.uuidReads).toBe(0);
  expect(transport.audit.unexpected).toEqual([]);
});

test("reportes de pago muestran carga y error, y reintentar recupera el reporte", async ({ page, transport }) => {
  transport.state.mode = "fail";
  transport.holdPaymentReads();
  await page.goto(`/invoices/${invoiceId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: invoiceNumber, exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Cargando reportes de pago" })).toBeVisible();
  transport.releasePaymentReads();
  await expect(page.getByText(errorTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Sin intentos de pago", { exact: true })).toHaveCount(0);
  const failedReads = transport.state.paymentReads;
  transport.state.mode = "success";
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText(paymentReference, { exact: true })).toBeVisible();
  await expect(page.getByText(errorTitle, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: paymentReference }).getByRole("button", { name: "Aprobar", exact: true })).toBeVisible();
  expect(transport.state.paymentReads).toBeGreaterThan(failedReads);
  expect(transport.audit.unexpected).toEqual([]);
});
