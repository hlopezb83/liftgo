import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const organizationId = "00000000-0000-4000-8000-000000000002";
const uuid = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
const xml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  TipoDeComprobante="I" Fecha="2026-11-01T10:00:00" Moneda="MXN" SubTotal="500" Total="500">
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="Proveedor ficticio"/>
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  UUID="${uuid}"/></cfdi:Complemento></cfdi:Comprobante>`;

test("XML import blocks submission and dismissal until its response settles", async ({ page, context, baseURL }, info) => {
  const audit = await installGroupCTransport(context, new URL(baseURL!).origin);
  let releaseUpload = () => {};
  const uploadGate = new Promise<void>((resolve) => { releaseUpload = resolve; });
  const writes: string[] = [];
  await context.route("http://127.0.0.1:54321/**", async (route) => {
    const request = route.request(), url = new URL(request.url());
    const json = (data: unknown) => route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": new URL(baseURL!).origin }, body: JSON.stringify(data) });
    if (request.method() === "POST" && url.pathname === "/rest/v1/rpc/current_organization_id") return json(organizationId);
    if (request.method() === "GET" && url.pathname === "/rest/v1/supplier_bills" && url.searchParams.has("cfdi_uuid")) return json(null);
    const prefix = `/storage/v1/object/supplier-bill-cfdi-xml/${organizationId}/${uuid}/`;
    if (request.method() === "POST" && url.pathname.startsWith(prefix)) {
      assert.ok(request.postDataBuffer()?.toString("utf8").includes(uuid));
      writes.push(url.pathname);
      await uploadGate;
      return json({ Key: url.pathname.replace("/storage/v1/object/", ""), Id: "synthetic-upload" });
    }
    return route.fallback();
  });
  try {
    await page.goto("/cuentas-por-pagar");
    await page.getByRole("button", { name: "Nueva factura", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Nueva factura de proveedor", exact: true });
    const subtotal = dialog.getByLabel(/Subtotal/);
    await subtotal.fill("77"); await subtotal.blur();
    await dialog.locator('input[type="file"]').setInputFiles({ name: "captura.xml", mimeType: "application/xml", buffer: Buffer.from(xml) });
    await expect.poll(() => writes.length).toBe(1);
    await expect(dialog.getByText("Procesando XML…", { exact: true })).toBeVisible();
    await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(subtotal).toHaveValue("77.00");
    await page.screenshot({ path: info.outputPath("xml-import-pending.png"), animations: "disabled" });
    releaseUpload();
    await expect(dialog.getByText("CFDI cargado", { exact: true })).toBeVisible();
    await expect(subtotal).toHaveValue("500.00");
    await expect(dialog.getByRole("button", { name: "Registrar", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Quitar CFDI cargado", exact: true }).click();
    await expect(subtotal).toHaveValue("77.00");
    expect(writes).toHaveLength(1);
  } finally {
    releaseUpload();
    const teardownErrors = await closeOfflinePages(context);
    await info.attach("xml-offline-network", { contentType: "application/json", body: JSON.stringify({ ...audit, writes, teardownErrors }) });
    expect(teardownErrors).toEqual([]);
    expect(audit.unexpected).toEqual([]);
    expect(audit.pageErrors).toEqual([]);
  }
});
