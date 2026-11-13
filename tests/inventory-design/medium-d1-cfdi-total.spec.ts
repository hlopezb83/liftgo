import { Buffer } from "node:buffer";
import { expect, test as base, type BrowserContext } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
async function installTransport(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const state = { uuidReads: 0, uploads: 0 };
  const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-expose-headers": "*" };
  await context.route(`${backend}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/rest/v1/supplier_bills" && url.searchParams.has("cfdi_uuid")) {
      state.uuidReads++;
      return route.fulfill({ json: [], headers });
    }
    if (url.pathname === "/rest/v1/rpc/current_organization_id") {
      return route.fulfill({ json: "00000000-0000-4000-8000-000000000002", headers });
    }
    if (url.pathname.startsWith("/storage/v1/object/supplier-bill-cfdi-xml/") && request.method() === "POST") {
      state.uploads++;
      return route.fulfill({ json: { Key: url.pathname, Id: "synthetic-xml" }, headers });
    }
    return route.fallback();
  });
  return { audit, state };
}

const test = base.extend<{ transport: Awaited<ReturnType<typeof installTransport>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installTransport(context, new URL(baseURL!).origin);
    try { await use(transport); } finally {
      const teardownErrors = await closeOfflinePages(context);
      await info.attach("cfdi-offline-network", { contentType: "application/json", body: JSON.stringify({ ...transport, teardownErrors }) });
      expect(transport.audit.unexpected).toEqual([]);
      expect(transport.audit.pageErrors).toEqual([]);
      expect(teardownErrors).toEqual([]);
    }
  }, { auto: true }],
});

test("rechaza totales incompatibles sin subir XML y permite importar uno conciliado", async ({ page, transport }) => {
  await page.goto("/cuentas-por-pagar");
  await page.getByRole("button", { name: /Nueva factura/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nueva factura de proveedor", exact: true });
  const subtotal = dialog.getByLabel(/Subtotal/);
  await subtotal.fill("77");
  await subtotal.blur();
  const upload = async (total: string) => {
    const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
      TipoDeComprobante="I" Fecha="2026-11-01T10:00:00" Moneda="MXN" SubTotal="100" ${total}>
      <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"/></cfdi:Complemento></cfdi:Comprobante>`;
    await dialog.locator('input[type="file"]').setInputFiles({ name: "total.xml", mimeType: "application/xml", buffer: Buffer.from(xml) });
  };
  for (const total of ['Total="105"', "", 'Total="no-numérico"']) {
    await upload(total);
    await expect(dialog.getByText(total === 'Total="105"' ? /El total del CFDI \(105.00 MXN\) no coincide/ : "El CFDI no indica un Total numérico válido.")).toBeVisible();
    await expect(subtotal).toHaveValue("77.00");
    expect(transport.state).toEqual({ uuidReads: 0, uploads: 0 });
  }
  await upload('Total="100"');
  await expect(dialog.getByText("CFDI cargado", { exact: true })).toBeVisible();
  await expect(subtotal).toHaveValue("100.00");
  expect(transport.state).toEqual({ uuidReads: 1, uploads: 1 });
  await page.screenshot({ path: `test-results/medium-d1-${test.info().project.name}.png`, fullPage: true });
});
