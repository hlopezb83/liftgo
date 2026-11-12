import { expect, type BrowserContext, type Route } from "@playwright/test";
import { installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const organizationId = id(2);
export const backend = "http://127.0.0.1:54321";
export const supplierRows = Array.from({ length: 501 }, (_, index) => ({
  id: id(1000 + index), organization_id: organizationId,
  name: index < 30 ? `Match proveedor ${String(index).padStart(3, "0")}` : `Otro proveedor ${String(index).padStart(3, "0")}`,
  contact_person: null, email: null, phone: null, website: null, address: null,
  rfc: null, regimen_fiscal: null, category: "refacciones", notes: null,
  default_payment_terms_days: 30, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
}));
export const customerRows = Array.from({ length: 501 }, (_, index) => {
  const name = index === 500 ? "TARGET501 Cliente remoto" : `Cliente ${String(index).padStart(3, "0")}`;
  const customer = { id: id(2000 + index), name, company: name, created_by_organization_id: organizationId,
    rfc: null, email: null, phone: null, contact_person: null, version: 1 };
  return { organization_id: organizationId, customer_id: customer.id, status: "active", alias: name,
    razon_social: name, rfc: null, regimen_fiscal: null, uso_cfdi: null, domicilio_fiscal_cp: null,
    tax_rate: 16, contact_person: null, email: null, phone: null, billing_address: null, website: null,
    representante_legal: null, notes: null, updated_at: "2026-01-01T00:00:00Z", customers: customer };
});
export const inventoryRows = Array.from({ length: 501 }, (_, index) => ({
  id: id(3000 + index), organization_id: organizationId, catalog_part_id: null,
  name: index === 500 ? "Z pieza antigua" : `Pieza ${String(index).padStart(3, "0")}`,
  sku: index === 500 ? "TARGET-501" : `SKU-${index}`, category: index === 500 ? "Baterías" : "Filtros",
  stock_quantity: index === 500 ? 0 : 10, min_stock_level: 2, unit_cost: 10,
  location: null, is_active: true, created_at: "2026-01-01", updated_at: "2026-01-01",
}));

export function json(route: Route, value: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json",
    headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(value) });
}

function slicePage<T>(rows: T[], url: URL) {
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? rows.length);
  return rows.slice(offset, offset + limit);
}

/** Only the HTTP boundary is synthetic: real compiled routes, hooks, forms and SDK. */
export async function installYagniTransport(context: BrowserContext, origin: string) {
  const base = await installGroupCTransport(context, origin);
  const requests: Array<{ table: string; params: URLSearchParams }> = [];
  const inventoryCalls: Record<string, unknown>[] = [];
  await context.route(`${backend}/rest/v1/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split("/").pop()!;
    if (request.method() === "OPTIONS") return route.fallback();
    if (table === "get_inventory_page" && request.method() === "POST") {
      const args = request.postDataJSON();
      expect(args.p_expected_organization_id).toBe(organizationId);
      inventoryCalls.push(args);
      const filtered = inventoryRows.filter(row => (!args.p_low_stock || row.stock_quantity <= row.min_stock_level)
        && (args.p_category === "all" || row.category === args.p_category)
        && (!args.p_search || `${row.name} ${row.sku}`.toLowerCase().includes(args.p_search.toLowerCase())));
      const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(filtered.length / args.p_page_size) - 1));
      return json(route, { items: filtered.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size),
        totalCount: filtered.length, lowStockCount: 1, pageIndex });
    }
    if (request.method() !== "GET") return route.fallback();
    requests.push({ table, params: url.searchParams });
    const single = request.headers().accept?.includes("vnd.pgrst.object");
    if (table === "role_permissions") return json(route,
      ["Dashboard", "Proveedores", "Clientes", "Refacciones", "Facturas de Proveedor", "Mantenimiento", "Flota", "Cotizaciones", "Facturas"]
        .map(module => ({ role: "admin", module, access_level: "full" })));
    if (table === "suppliers") {
      const key = url.searchParams.get("id")?.replace("eq.", "");
      const rows = key ? supplierRows.filter(row => row.id === key) : slicePage(supplierRows, url);
      return json(route, single ? rows[0] ?? null : rows);
    }
    if (["supplier_contacts", "supplier_bank_accounts", "parts_catalog", "parts_inventory"].includes(table)) return json(route, []);
    if (table === "supplier_bills" || table === "maintenance_logs") {
      const supplierId = url.searchParams.get("supplier_id")?.replace("eq.", "");
      // Fail closed: a global fetch cannot accidentally satisfy the detail scenario.
      expect(supplierId).toBeTruthy();
      expect(url.searchParams.get("organization_id")).toBe(`eq.${organizationId}`);
      const rows = Array.from({ length: 501 }, (_, index) => ({
        id: id((table === "supplier_bills" ? 4000 : 5000) + index), organization_id: organizationId,
        supplier_id: supplierId, issue_date: "2026-11-01", category: "refacciones", description: `Gasto ${index}`,
        total: index === 500 ? 10 : 1, currency: index === 500 ? "USD" : "MXN", exchange_rate: index === 500 ? 20 : 1,
        status: "pending", forklift_id: id(4), performed_at: "2026-11-01", service_type: `Servicio ${index}`,
        cost: index === 500 ? 5 : 1, forklifts: { name: "Equipo sintético" },
      }));
      return json(route, slicePage(rows, url));
    }
    if (table === "organization_customers") {
      const customerId = url.searchParams.get("customer_id")?.replace("eq.", "");
      const searching = [...url.searchParams].some(([key, value]) => key.endsWith("or") && value.includes(".ilike."));
      const rows = customerId ? customerRows.filter(row => row.customer_id === customerId)
        : searching ? customerRows.filter(row => row.alias.includes("TARGET501")) : slicePage(customerRows, url);
      return json(route, single ? rows[0] ?? null : rows);
    }
    return route.fallback();
  });
  async function finish() {
    expect(await closeOfflinePages(context)).toEqual([]);
    expect(base.unexpected).toEqual([]);
    expect(base.pageErrors).toEqual([]);
    const allowedBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(base.externalBlocked.filter(request => !allowedBlocked.has(request))).toEqual([]);
  }
  return { ...base, requests, inventoryCalls, finish };
}
