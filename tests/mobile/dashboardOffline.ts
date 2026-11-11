import { expect, type BrowserContext } from "@playwright/test";
import { installOfflineDispatcher } from "./offlineDispatcher";

export type DashboardProfile = "dispatcher" | "admin";
export const dashboardCustomer = "QA Cliente ficticio con nombre comercial largo para revisar el Panel";
export const dashboardEquipment = "QA Unidad de demostración con descripción operativa extensa";
const USER = "00000000-0000-4000-8000-000000000001";
const BOOKING = "00000000-0000-4000-8000-000000000003";
const FORKLIFT = "00000000-0000-4000-8000-000000000004";
const INVOICE = "00000000-0000-4000-8000-000000000051";
const adminModules = [
  "Dashboard", "Flota", "Reservas", "Calendario", "Entregas", "Facturas", "Contratos", "Cotizaciones", "Clientes",
  "CRM / Prospectos", "Mantenimiento", "Daños", "Refacciones", "Gastos", "Proveedores", "Reportes", "MRR",
  "Configuración", "Gestión de Usuarios", "Feedback", "Auditoría", "Facturas de Proveedor", "Flujo de Caja",
  "Cuentas Bancarias", "Conciliación Bancaria",
];
const stats = {
  pending_deliveries_count: 4,
  fleet_counts: { total: 6000, available: 3000, rented: 2500, maintenance: 400, retired: 50, sold: 50 },
  invoice_stats: { outstanding_revenue: 987654321.98, breakdown: [] },
  overdue_invoices: [{ id: INVOICE, invoice_number: "QA-PANEL-FAC-001", customer_name: dashboardCustomer,
    total: 123456789.12, balance: 123456789.12, balance_mxn: 123456789.12,
    due_date: "2026-10-01", status: "overdue", booking_id: BOOKING }],
  overdue_bookings: [{ booking_id: BOOKING, forklift_id: FORKLIFT, forklift_name: dashboardEquipment,
    customer_name: dashboardCustomer, end_date: "2026-10-01", days_overdue: 41 }],
  maintenance_alerts: [{ forklift_id: FORKLIFT, forklift_name: "QA Unidad con servicio pendiente y nombre extenso", next_date: "2026-10-01" }],
  cash_flow: [{ month_key: "2026-10-01", invoiced: 123456789.12, paid: 98765432.10 }],
  utilization: [{ name: dashboardEquipment, utilization: 70, revenue: 123456789.12 }],
  monthly_utilization: [{ month_label: "oct", utilization: 70 }], recent_activity: [],
};
const kpis = {
  mrr: 987654321.98, dso: 123.4, overdue_total: 123456789.12,
  expiring_contracts: [{ id: "00000000-0000-4000-8000-000000000052", contract_number: "QA-PANEL-CON-001",
    customer_name: dashboardCustomer, forklift_name: dashboardEquipment, end_date: "2026-11-15", days_remaining: 4 }],
};
const insurance = { no_insurance_count: 2, expiring: [{ id: FORKLIFT,
  name: "QA Equipo con seguro por vencer y nombre largo", insurance_expiry: "2026-11-15", insurance_provider: "QA", days_left: 4 }] };

/** Adds only Dashboard reads to the shared fail-closed synthetic transport. */
export async function installOfflineDashboard(context: BrowserContext, origin: string, profile: DashboardProfile) {
  const backend = await installOfflineDispatcher(context, origin);
  await context.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:54321" || request.method() === "OPTIONS") return route.fallback();
    const resource = url.pathname.split("/").pop() ?? "";
    const reject = () => { backend.unexpected.push(`${request.method()} ${url.pathname} (${profile})`); return route.abort(); };
    const json = (value: unknown) => route.fulfill({ status: 200, contentType: "application/json", headers: {
      "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS",
    }, body: JSON.stringify(value) });
    if (profile === "admin" && ["user_roles", "role_permissions"].includes(resource)) {
      if (request.method() !== "GET") return reject();
      backend.observed.add(resource);
      return json(resource === "user_roles" ? [{ user_id: USER, role: "admin" }]
        : adminModules.map((module) => ({ role: "admin", module, access_level: "full" })));
    }
    const reads: Record<string, unknown> = { get_dashboard_stats: stats, get_insurance_alerts: insurance };
    if (profile === "admin") reads.get_financial_kpis = kpis;
    if (url.pathname.startsWith("/rest/v1/rpc/") && resource in reads) {
      if (request.method() !== "POST") return reject();
      expect(request.postDataJSON() ?? {}).toEqual({});
      backend.observed.add(resource);
      // Deliberately include financial stats for dispatcher too, as if cached
      // from a broader role. The real UI must suppress that payload.
      return json(reads[resource]);
    }
    if (resource === "list_invoices_with_balance") {
      if (profile !== "admin" || request.method() !== "POST") return reject();
      const input = request.postDataJSON();
      if (input.p_limit !== 1000 || input.p_offset !== 0 || input.p_with_balance_only !== true ||
        JSON.stringify(input.p_statuses) !== '["sent","partial"]' || !input.p_due_from || !input.p_due_to) return reject();
      backend.observed.add(resource);
      return json([]);
    }
    return route.fallback();
  });
  return backend;
}
