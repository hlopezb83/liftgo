import { expect, test as base, type BrowserContext, type Route } from "@playwright/test";
import { billId, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const supplierId = "00000000-0000-4000-8000-000000000061";
const billNumber = "QA-CXP-ELEGIBLE";
const cancelledNumber = "QA-CXP-CANCELADA";
const supplier = { id: supplierId, name: "Proveedor QA de dispersión", rfc: "XAXX010101000" };
const eligibleBill = {
  id: billId, supplier_id: supplierId, suppliers: supplier, bill_number: billNumber,
  issue_date: "2026-11-01", due_date: "2026-12-01", subtotal: 100, tax_amount: 16,
  retention_iva: 0, retention_isr: 0, total: 116, balance: 116, currency: "MXN", exchange_rate: 1,
  status: "pending", approval_status: "not_required", category: "mantenimiento",
  description: "Factura ficticia local sin pagos", payments: [], cfdi_uuid: null,
  payment_method_sat: "PPD", payment_in_progress_at: null, approved_at: null, approval_notes: null,
};

async function installPayablesTransport(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const exportRequests: URLSearchParams[] = [];
  const mutations: Array<{ method: string; id: string | null; select: string | null }> = [];
  const rows = [eligibleBill,
    { ...eligibleBill, id: "00000000-0000-4000-8000-000000000074", bill_number: cancelledNumber, status: "cancelled" },
    { ...eligibleBill, id: "00000000-0000-4000-8000-000000000075", bill_number: "QA-CXP-BORRADOR", status: "draft" },
  ];
  const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS, HEAD, PATCH, DELETE" };
  const json = (route: Route, data: unknown) => route.fulfill({
    status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(data),
  });
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const table = url.pathname.split("/").pop();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (table === "get_supplier_bills_page" && method === "POST") {
      return json(route, { items: [eligibleBill], totalCount: 1 });
    }
    if (table === "supplier_payments" && method === "HEAD") {
      return route.fulfill({ status: 200, headers: { ...cors, "content-range": "*/0",
        "access-control-expose-headers": "content-range" }, body: "" });
    }
    if (table === "supplier_payments" && method === "GET") return json(route, []);
    if (table === "supplier_bank_accounts" && method === "GET") return json(route, [{
      supplier_id: supplierId, bank_name: "Banco QA", clabe: "012345678901234568",
      account_number: null, account_holder: supplier.name, is_primary: true, created_at: "2026-11-01",
    }]);
    if (table !== "supplier_bills") return route.fallback();
    if (method === "PATCH" || method === "DELETE") {
      mutations.push({ method, id: url.searchParams.get("id"), select: url.searchParams.get("select") });
      // A confirmed HTTP response with no matching row: nothing is written, even to this fixture.
      return json(route, []);
    }
    if (method !== "GET") return route.fallback();
    if (url.searchParams.has("id")) {
      const matches = rows.filter(row => `eq.${row.id}` === url.searchParams.get("id"));
      return json(route, request.headers().accept?.includes("vnd.pgrst.object") ? matches[0] ?? null : matches);
    }
    exportRequests.push(url.searchParams);
    const excluded = url.searchParams.getAll("status").map(value => value.replace(/^neq\./, ""));
    const approvals = url.searchParams.get("approval_status")?.slice(4, -1).split(",") ?? [];
    const minimum = Number(url.searchParams.get("balance")?.replace(/^gt\./, ""));
    const filtered = rows.filter(row => !excluded.includes(row.status)
      && approvals.includes(row.approval_status) && row.balance > minimum);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return json(route, filtered.slice(offset, offset + Number(url.searchParams.get("limit"))));
  });
  return { audit, exportRequests, mutations };
}

const test = base.extend<{ transport: Awaited<ReturnType<typeof installPayablesTransport>> }>({
  transport: [async ({ context, baseURL }, use, info) => {
    const transport = await installPayablesTransport(context, new URL(baseURL!).origin);
    await use(transport);
    const teardownErrors = await closeOfflinePages(context);
    await info.attach("payables-offline-network", { contentType: "application/json", body: JSON.stringify({
      ...transport.audit, mutations: transport.mutations, teardownErrors,
      exportRequests: transport.exportRequests.map(params => [...params]),
    }, null, 2) });
    expect(transport.audit.unexpected).toEqual([]);
    expect(transport.audit.pageErrors).toEqual([]);
    const allowedBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(transport.audit.externalBlocked.filter(request => !allowedBlocked.has(request))).toEqual([]);
    expect(teardownErrors).toEqual([]);
  }, { auto: true }],
});

test("CxP excluye canceladas de la dispersión y conserva una factura elegible seleccionada", async ({ page, transport }) => {
  await page.goto("/cuentas-por-pagar");
  await page.getByRole("button", { name: "Más acciones", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exportar pagos", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exportar pagos a Excel", exact: true });
  await expect(dialog.getByRole("checkbox", { name: `Seleccionar factura ${billNumber}`, exact: true })).toBeChecked();
  await expect(dialog.getByText(cancelledNumber, { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("QA-CXP-BORRADOR", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Descargar Excel (1)", exact: true })).toBeEnabled();
  expect(transport.exportRequests.length).toBeGreaterThan(0);
  expect(transport.exportRequests[0].getAll("status")).toEqual(["neq.draft", "neq.cancelled"]);
  expect(transport.mutations).toEqual([]);
});

for (const operation of ["cancel", "delete"] as const) {
  test(`CxP ${operation} con cero filas muestra error y conserva el detalle`, async ({ page, transport }) => {
    await page.goto("/cuentas-por-pagar");
    await page.getByText(billNumber, { exact: true }).first().click();
    const sheet = page.getByRole("dialog", { name: billNumber, exact: true });
    await expect(sheet).toBeVisible();
    const cancellationDialog = page.getByRole("dialog", { name: `Cancelar registro de factura ${billNumber}`, exact: true });
    if (operation === "cancel") {
      await sheet.getByRole("button", { name: "Cancelar registro", exact: true }).click();
      await cancellationDialog.getByRole("button", { name: "Cancelar registro", exact: true }).click();
    } else {
      await sheet.getByRole("button", { name: "Eliminar", exact: true }).click();
      await page.getByRole("alertdialog", { name: `Eliminar factura ${billNumber}`, exact: true })
        .getByRole("button", { name: "Eliminar definitivamente", exact: true }).click();
    }
    const errorMessage = operation === "cancel" ? "No se pudo cancelar el registro de factura" : "No se pudo eliminar la factura";
    const successMessage = operation === "cancel" ? "Registro de factura de proveedor cancelado" : "Factura eliminada";
    const retainedDialog = operation === "cancel" ? cancellationDialog : sheet;
    await expect(page.getByText(errorMessage, { exact: true })).toBeVisible();
    await expect(page.getByText(successMessage, { exact: true })).toHaveCount(0);
    await expect(page.getByText(/no se modificó ningún registro/)).toBeVisible();
    await expect(retainedDialog).toBeVisible();
    // The child modal correctly hides its parent from the accessibility tree.
    if (operation === "cancel") await cancellationDialog.getByRole("button", { name: "Volver", exact: true }).click();
    await expect(sheet).toBeVisible();
    expect(transport.mutations).toEqual([{
      method: operation === "cancel" ? "PATCH" : "DELETE", id: `eq.${billId}`, select: "id",
    }]);
  });
}
