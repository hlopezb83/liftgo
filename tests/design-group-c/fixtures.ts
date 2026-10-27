import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { compiledRoot } from "./paths";

const BACKEND = "http://127.0.0.1:54321";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER = id(1), ORG = id(2), MODEL = id(41), SUPPLIER = id(61);
export const customerId = id(31), forkliftId = id(4), billId = id(71);
export const invoiceId = id(81);
export const invoiceNumber = "FAC-2026-OPERACION-INDUSTRIAL-00000012340";
export const customerName = "QA Cliente Industrial de Maniobras y Servicios del Norte de México";
export const equipmentName = "QA Equipo ficticio industrial con nombre largo para maniobras del norte";
export const modelName = "Modelo Industrial Eléctrico de Capacidad Extendida 2500";
const customer = { id: customerId, name: customerName, company: customerName, created_by_organization_id: ORG, rfc: "XAXX010101000", email: "contacto.operaciones.industriales.qa@example.invalid", phone: "0000000000", contact_person: "QA Contacto Industrial con nombre completo y apellidos muy largos", website: "https://example.invalid/servicios/montacargas", version: 1 };
const relation = { organization_id: ORG, customer_id: customerId, status: "active", alias: customerName, razon_social: customerName, rfc: customer.rfc, regimen_fiscal: "601", uso_cfdi: "G03", domicilio_fiscal_cp: "64000", tax_rate: 16, contact_person: customer.contact_person, email: customer.email, phone: customer.phone, billing_address: "Calle Ficticia Industrial 123, Parque de Maniobras QA, Monterrey, Nuevo León", website: customer.website, representante_legal: "QA Representante Legal Ficticio", updated_at: "2026-10-01T12:00:00Z", customers: customer };
const model = { id: MODEL, organization_id: ORG, manufacturer: "QA Fabricante Industrial de Equipos de Nombre Largo", model: modelName, is_active: true, default_daily_rate: 123456.78, default_weekly_rate: 987654.32, default_monthly_rate: 1234567.89, default_capacity_kg: 2500, default_mast_height_m: 4.5, default_fuel_type: "Electric" };
const forklift = { id: forkliftId, organization_id: ORG, name: equipmentName, model: modelName, manufacturer: model.manufacturer, serial_number: "QA-SERIE-FICTICIA-00001", status: "available", daily_rate: model.default_daily_rate, weekly_rate: model.default_weekly_rate, monthly_rate: model.default_monthly_rate, acquisition_cost: 12345678.90, capacity_kg: 2500, mast_height_m: 4.5, fuel_type: "Electric", year: 2026, equipment_model_id: MODEL, deleted_at: null, created_at: "2026-01-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z", insurance_provider: "QA Aseguradora Industrial Ficticia con nombre largo", insurance_policy_number: "QA-POLIZA-FICTICIA-000000123456789", insurance_expiry: "2027-12-31", insurance_cost: 123456.78, notes: "Fixture ficticio local para revisar el último campo y las acciones persistentes. No contiene datos operativos." };
const summary = {
  bookings: ["active", "confirmed"].map((status, n) => ({ id: id(3 + n), booking_number: `QA-RES-000${n + 1}`, status, start_date: "2026-10-01", end_date: "2026-11-30", forklift: { name: equipmentName, model: modelName } })),
  invoices: ["USD", "MXN"].map((currency, n) => ({ id: id(81 + n), invoice_number: `FAC-2026-OPERACION-INDUSTRIAL-0000001234${n}`, issued_at: "2026-10-01", due_date: "2026-11-15", total: n ? 987654321.09 : 1234567890.12, status: n ? "overdue" : "sent", currency, tipo_cambio: currency === "USD" ? 20 : 1 })),
  totals: { total_invoiced: 1500000, total_paid: 500000, total_credited: 0, outstanding_revenue: 1000000, fx_missing_count: 0 },
};
const invoiceRows = summary.invoices.map(invoice => ({
  ...invoice, organization_id: ORG, customer_id: customerId, customer_name: customerName,
  moneda: invoice.currency, subtotal: invoice.total, tax_rate: 0, tax_amount: 0,
  line_items: [], notes: "Fixture ficticio local: sólo prueba navegación de regreso.",
  cfdi_status: "pending", cfdi_uuid: null, cfdi_pdf_url: null, cfdi_xml_url: null,
  cfdi_xml: null, cfdi_error_message: null, cfdi_xml_pending: false,
  cancellation_status: null, invoice_type: "ingreso", forma_pago: "99", metodo_pago: "PPD",
  uso_cfdi: "G03", receptor_rfc: "XAXX010101000", receptor_razon_social: customerName,
  receptor_regimen_fiscal: "601", receptor_domicilio_fiscal_cp: "64000",
  booking_id: null, quote_id: null, version: 1, is_e2e: false,
  created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
}));
const supplier = { id: SUPPLIER, name: "QA Proveedor Industrial Ficticio de Maniobras y Equipos del Norte", rfc: "XAXX010101000", is_active: true, payment_terms_days: 30 };
export const billNumber = "QA-FACTURA-PROVEEDOR-INDUSTRIAL-1234567890";
const bill = { id: billId, organization_id: ORG, supplier_id: SUPPLIER, bill_number: billNumber, suppliers: supplier, folio: "1234567890", serie: "QA", cfdi_uuid: id(91), issue_date: "2026-10-01", due_date: "2026-11-30", subtotal: 1200000000, tax_amount: 192000000, retention_iva: 10000000, retention_isr: 5000000, total: 1377000000, balance: 1234567890.12, currency: "USD", exchange_rate: 20, payment_method_sat: "PPD", payment_form_sat: "99", status: "partial", approval_status: "approved", approved_at: "2026-10-02T12:00:00Z", approval_notes: "Fixture ficticio: aprobación existente para revisar contexto sin autorizar operaciones.", category: "mantenimiento", description: "Servicio ficticio de mantenimiento con descripción larga para revisar ajuste de líneas dentro del detalle y las acciones al desplazarse.", payments: [{ id: id(72), bill_id: billId, amount: 142432109.88, payment_date: "2026-10-02", payment_method: "transferencia", reference: "QA-REFERENCIA-FICTICIA-LARGA-000001", rep_required: false, rep_status: "not_required", receipt_url: null }], payment_in_progress_at: null };

export interface FixtureProfile { role?: "admin" | "dispatcher" | "mechanic" | "ventas"; invoicesAccess?: "full" | "read" | "none"; payablesAccess?: "full" | "read" | "none"; currency?: "MXN" | "USD"; approval?: "approved" | "pending"; billError?: boolean; }
interface GroupCTransportLedger {
  unexpected: string[]; observed: string[]; externalBlocked: string[]; pageErrors: string[];
  provenance: { version: string; generatedAt: string; sourceSha256: string }; profile: FixtureProfile;
}
const contextLedgers = new WeakMap<BrowserContext, GroupCTransportLedger[]>();
export function getGroupCTransportLedgers(context: BrowserContext): readonly GroupCTransportLedger[] {
  return contextLedgers.get(context) ?? [];
}
export async function installGroupCTransport(context: BrowserContext, origin: string, profile: FixtureProfile = {}) {
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local origin required");
  const role = profile.role ?? "admin";
  const activeBill = { ...bill, currency: profile.currency ?? "USD", approval_status: profile.approval ?? "approved" };
  const rows: Record<string, unknown[]> = {
    user_roles: [{ role, user_id: USER }],
    role_permissions: ["Dashboard", "Flota", "Reservas", "Calendario", "Entregas", "Clientes", "Contratos", "Cotizaciones", "Facturas", "Pagos", "Configuración", "Facturas de Proveedor", "Mantenimiento", "Daños", "Proveedores", "Gestión de Usuarios"].map(module => ({ role, module, access_level: module === "Facturas" ? profile.invoicesAccess ?? "full" : module === "Facturas de Proveedor" ? profile.payablesAccess ?? "full" : module === "Daños" ? "read" : "full" })),
    customers: [customer], organization_customers: [relation], equipment_models: [model], forklifts: [forklift], suppliers: [supplier], supplier_bills: [activeBill], supplier_payments: activeBill.payments,
    supplier_bill_approvals: [{ id: id(73), bill_id: billId, action: "approved", actor_name: "QA Usuario Ficticio", created_at: "2026-10-02T12:00:00Z", notes: "Revisión ficticia local" }],
    company_settings: [{ id: id(62), cxp_approval_threshold_mxn: 100000 }],
    // SupplierPaymentRow -> ReconciliationBadge -> useReconciliationStatus:
    // the synthetic payment has no matched bank-statement line.
    bank_statement_lines: [],
    bookings: [], invoices: invoiceRows, payments: [], credit_notes: [], customer_payment_intents: [], collection_notes: [], customer_portal_accounts: [], profiles: [], notifications: [], user_preferences: [], return_inspections: [], invoice_bookings: [], deliveries: [], drivers: [], maintenance_logs: [], status_logs: [], forklift_current_location: [{ forklift_id: forkliftId, location: "QA Instalación ficticia local", has_active_policy: false }], entity_documents: [], documents: [], damage_photos: [], audit_logs: [],
  };
  const identity = JSON.parse(readFileSync(resolve(compiledRoot, "../../client/version.json"), "utf8")) as { version: string; generatedAt: string; sourceSha256: string };
  const provenance = { version: identity.version, generatedAt: identity.generatedAt, sourceSha256: identity.sourceSha256 };
  if (!/^[a-f0-9]{64}$/.test(provenance.sourceSha256)) throw new Error("Missing compiled source provenance");
  const compiled = readdirSync(compiledRoot).filter(f => /^server-.*\.mjs$/.test(f)).map(f => readFileSync(`${compiledRoot}/${f}`, "utf8")).join("\n");
  const functions = new Map<string, unknown>();
  for (const [name, payload] of Object.entries({ getOrganizationContext: { context: { status: "ready", organizationId: ORG, memberType: "internal", customerId: null }, errorCode: null }, getPlatformOperatorStatusFn: { isOperator: false } })) {
    const key = compiled.match(new RegExp(`"([a-f0-9]+)": \\{\\s*functionName: "${name}_createServerFn_handler"`))?.[1];
    if (!key) throw new Error(`Missing read server function ${name}`);
    functions.set(key, { result: payload, context: {} });
  }
  const user = { id: USER, aud: "authenticated", role: "authenticated", email: "qa@example.invalid", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const now = Math.floor(Date.now() / 1000), encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, amr: [{ method: "password", timestamp: now }] })}.synthetic-test-signature`, refresh_token: "synthetic-test-refresh", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user };
  await context.addInitScript(({ origin, session }) => { if (location.origin === origin) localStorage.setItem("sb-127-auth-token", JSON.stringify(session)); }, { origin, session });
  const unexpected: string[] = [], observed: string[] = [], externalBlocked: string[] = [], pageErrors: string[] = [];
  const capturePageErrors = (page: Page) => page.on("pageerror", error => pageErrors.push(error.message));
  context.pages().forEach(capturePageErrors);
  context.on("page", capturePageErrors);
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
    const json = (value: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(value) });
    const reject = () => { unexpected.push(`${method} ${url.pathname}`); return route.abort(); };
    if (url.origin === origin) {
      if (req.headers()["x-tsr-serverfn"] === "true" || url.pathname.includes("_serverFn")) {
        const key = url.pathname.split("/").pop()!;
        if (method !== "GET" || !functions.has(key)) return reject();
        observed.push(`serverFn GET ${key}`); return json(functions.get(key));
      }
      if (method !== "GET") return reject();
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) return reject();
      return route.fulfill({ response });
    }
    if (url.origin !== BACKEND) { externalBlocked.push(`${method} ${url.origin}${url.pathname}`); return route.abort(); }
    if (/^\/api\/\d+\/envelope\/?$/.test(url.pathname)) { externalBlocked.push(`telemetry blocked ${method} ${url.pathname}`); return route.abort(); }
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/user" && method === "GET") return json(user);
    const rpc = url.pathname.replace("/rest/v1/rpc/", "");
    const reads: Record<string, unknown> = {
      get_organization_display_name: "QA Empresa ficticia", get_public_branding: [{ razon_social: "QA Empresa ficticia" }], get_sidebar_badge_counts: {}, today_mty: "2026-10-27",
      get_occupied_forklift_ids_today: [],
      get_customer_summary: summary, get_customer_profitability: { revenue: 1500000, maintenance_cost: 250000, gross_margin: 1250000, margin_percent: 83.3 },
      get_forklift_financials: { revenue: 1500000, maintenance_cost: 250000, acquisition_cost: 12345678.9, gross_margin: 1250000, roi_percent: 10.1, days_rented: 100, days_since_acquired: 300, utilization_percent: 33.3, hourometer_history: [] },
      get_supplier_bills_page: { items: [activeBill], totalCount: 1 },
      get_accounts_payable_summary: { kpis: { totalPendiente: 1234567890.12, totalVencido: 0, totalPorVencer: 1234567890.12, pagadoMesActual: 142432109.88, totalPorAprobar: 0, countPorAprobar: 0, repPendientes: 0, fxMissingCount: 0 }, availableMonths: ["2026-10"] },
      count_releasable_payment_locks: 0,
    };
    if (url.pathname.startsWith("/rest/v1/rpc/") && rpc in reads && ["GET", "POST"].includes(method)) { observed.push(`read RPC ${rpc}`); return json(reads[rpc]); }
    if (url.pathname.startsWith("/rest/v1/") && !url.pathname.includes("/rpc/") && method === "GET") {
      const table = url.pathname.split("/").pop()!;
      if (!(table in rows)) return reject();
      observed.push(`GET ${table}`);
      if (table === "supplier_bills" && profile.billError && url.searchParams.has("id")) return route.fulfill({ status: 500, headers: cors, contentType: "application/json", body: JSON.stringify({ code: "FIXTURE_QUERY_ERROR", message: "Fallo ficticio de lectura" }) });
      let result = rows[table];
      if (url.searchParams.has("id")) result = result.filter(row => (row as { id: string }).id === url.searchParams.get("id")!.replace(/^eq\./, ""));
      return json(req.headers().accept?.includes("vnd.pgrst.object") ? result[0] ?? null : result);
    }
    return reject();
  });
  const ledger = { unexpected, observed, externalBlocked, pageErrors, provenance, profile };
  const ledgers = contextLedgers.get(context) ?? [];
  ledgers.push(ledger);
  contextLedgers.set(context, ledgers);
  return ledger;
}
