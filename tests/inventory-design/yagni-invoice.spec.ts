import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";
import { backend, customerRows, id, installYagniTransport, json, organizationId } from "./yagni-fixtures";

test("factura desde cotización consulta por ID al cliente fuera de los primeros 501 y aplica sus datos CFDI", async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  const customerId = id(2501), quoteId = id(9500);
  const customerName = "TARGET502 Cliente de cotización";
  const fiscal = { razon_social: "RECEPTOR REMOTO 502 SA DE CV", rfc: "RTE010101ABC",
    regimen_fiscal: "603", domicilio_fiscal_cp: "64010", uso_cfdi: "G01", tax_rate: 8 };
  const relation = { ...customerRows[0], ...fiscal, customer_id: customerId, alias: customerName,
    customers: { ...customerRows[0].customers, id: customerId, name: customerName, company: customerName } };
  const quote = { id: quoteId, organization_id: organizationId, quote_number: "COT-QA-CLIENTE-502",
    customer_id: customerId, customer_name: customerName, quote_type: "rental", version: 3,
    currency: "MXN", tipo_cambio: 1, tax_rate: 8, subtotal: 1000, tax_amount: 80, total: 1080,
    status: "sent", start_date: "2026-11-01", end_date: "2026-11-02", notes: "Cotización sintética sin guardado",
    line_items: [{ description: "Renta sintética de equipo", quantity: 1, unit_price: 1000, total: 1000, line_kind: "rental" }] };
  const directCustomerReads: URLSearchParams[] = [];
  const invoiceWrites: string[] = [];
  context.on("request", request => {
    if (request.method() !== "GET" && request.method() !== "OPTIONS"
      && /\/rest\/v1\/(?:invoices(?:\?|$)|rpc\/save_invoice_with_bookings(?:\?|$))/.test(request.url())) {
      invoiceWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  // The receiver is deliberately absent even from the initial 501-row lookahead.
  expect(customerRows).toHaveLength(501);
  expect(customerRows.some(row => row.customer_id === customerId)).toBe(false);
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const name = url.pathname.split("/").pop();
    if (request.method() === "OPTIONS") return route.fallback();
    if (request.method() === "GET") {
      const single = request.headers().accept?.includes("vnd.pgrst.object");
      if (name === "organization_customers" && url.searchParams.get("customer_id") === `eq.${customerId}`) {
        directCustomerReads.push(url.searchParams);
        assert.equal(url.searchParams.get("status"), "eq.active");
        return json(route, single ? relation : [relation]);
      }
      if (name === "quotes") {
        assert.equal(url.searchParams.get("id"), `eq.${quoteId}`);
        return json(route, single ? quote : [quote]);
      }
      if (name === "quote_assigned_forklifts") {
        assert.equal(url.searchParams.get("quote_id"), `eq.${quoteId}`);
        return json(route, []);
      }
    }
    if (request.method() === "POST") {
      if (name === "get_invoice_booking_candidate_page") {
        const args = request.postDataJSON();
        assert.equal(args.p_expected_organization_id, organizationId);
        assert.deepEqual(args.p_linked_ids, []);
        return json(route, { rows: [], linked: [], hasMore: false, pageIndex: args.p_page });
      }
      if (name === "get_quote_charge_availability") {
        assert.deepEqual(request.postDataJSON().p_quote_ids, [quoteId]);
        return json(route, { complete: true, quotes: [{ quote_id: quoteId, legacy_review_required: false, lines: [] }] });
      }
      if (name === "peek_next_draft_invoice_number") return json(route, "FAC-QA-SIN-GUARDAR");
    }
    return route.fallback();
  });

  await page.goto(`/invoices/new?from_quote=${quoteId}`);
  await expect(page.getByRole("heading", { name: "Nueva factura", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /^Cliente \(obligatorio\):/ })).toContainText(customerName);
  await expect(page.getByText(`${fiscal.rfc} · Régimen ${fiscal.regimen_fiscal} · CP ${fiscal.domicilio_fiscal_cp}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "RFC Receptor", exact: true })).toHaveValue(fiscal.rfc);
  await expect(page.getByRole("textbox", { name: "Razón Social", exact: true })).toHaveValue(fiscal.razon_social);
  await expect(page.getByRole("textbox", { name: "Régimen Fiscal Receptor", exact: true })).toHaveValue(fiscal.regimen_fiscal);
  await expect(page.getByRole("textbox", { name: "C.P. Fiscal Receptor", exact: true })).toHaveValue(fiscal.domicilio_fiscal_cp);
  await expect(page.getByRole("combobox", { name: "Uso CFDI", exact: true })).toContainText("Adquisición de mercancías");
  await expect(page.getByRole("button", { name: "Crear factura", exact: true })).toBeEnabled();

  expect(directCustomerReads.length).toBeGreaterThan(0);
  const initialLists = transport.requests.filter(request => request.table === "organization_customers"
    && !request.params.has("customer_id"));
  expect(initialLists.length).toBeGreaterThan(0);
  expect(initialLists.every(request => request.params.get("limit") === "501")).toBe(true);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-invoice502.png`, fullPage: true });
  await transport.finish();
  expect(invoiceWrites).toEqual([]);
});
