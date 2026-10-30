import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";

// Adapted from the read-only design audit's synthetic fixtures. No real
// credentials, organization, customer, booking or fiscal records are used.
const BACKEND = "http://127.0.0.1:54321";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER = id(1), ORG = id(2), CUSTOMER = id(31), MODEL = id(41), FORKLIFT = id(4);
export const bookingId = id(3);
export const customerName = "QA Cliente ficticio de maniobras industriales con nombre largo para revisión";
export const forkliftName = "QA Equipo ficticio de nombre operativo largo para maniobras industriales";
export const modelName = "QA Modelo ficticio eléctrico de capacidad extendida 2500";

export interface BookingScenario {
  currency?: "MXN" | "USD";
  status?: "confirmed" | "completed" | "cancelled";
  profile?: "admin" | "readonly" | "operational-full";
  recurringBilling?: boolean;
}

function scenarioRows(scenario: BookingScenario): Record<string, unknown[]> {
  const operational = scenario.profile === "readonly" || scenario.profile === "operational-full";
  const role = operational ? "dispatcher" : "admin";
  const model = { id: MODEL, organization_id: ORG, manufacturer: "QA", model: modelName, is_active: true, default_daily_rate: 1000, default_weekly_rate: 5000, default_monthly_rate: 15000 };
  const forklift = { id: FORKLIFT, organization_id: ORG, name: forkliftName, model: modelName, manufacturer: "QA", serial_number: "QA-SERIE-001", status: "available", daily_rate: 1000, weekly_rate: 5000, monthly_rate: 15000, equipment_model_id: MODEL, deleted_at: null };
  const customer = { id: CUSTOMER, name: customerName, company: customerName, created_by_organization_id: ORG, email: "qa@example.invalid", contact_person: "QA Contacto ficticio", version: 1, deleted_at: null };
  const booking = { id: bookingId, organization_id: ORG, booking_number: "QA-RES-001", customer_id: CUSTOMER, customer_name: customerName, customer_contact: "QA Contacto administrativo ficticio", site_contact_name: "QA Contacto de obra ficticio", site_contact_phone: "0000000000", forklift_id: FORKLIFT, forklifts: { name: forkliftName, model: modelName }, status: scenario.status ?? "confirmed", start_date: "2026-10-01", end_date: "2026-10-31", daily_rate: 900, weekly_rate: 4500, monthly_rate: 14000, recurring_billing: scenario.recurringBilling ?? false, last_billed_date: null, currency: scenario.currency ?? "MXN", tipo_cambio: 1, version: 1, is_e2e: false };
  const modules = ["Dashboard", "Flota", "Reservas", "Calendario", "Entregas", "Clientes", "Contratos", "Cotizaciones", "Facturas", "Pagos", "Configuración", "Facturas de Proveedor", "Mantenimiento", "Daños", "Refacciones", "Gastos", "Proveedores", "Reportes", "MRR", "Gestión de Usuarios", "Feedback", "Auditoría", "Flujo de Caja", "Cuentas Bancarias", "Conciliación Bancaria", "CRM / Prospectos"];
  const readable = new Set(["Dashboard", "Flota", "Reservas", "Calendario", "Entregas", "Clientes"]);
  return {
    user_roles: [{ role, user_id: USER }],
    role_permissions: modules.map((module) => ({
      role,
      module,
      access_level: operational
        ? (module === "Reservas" && scenario.profile === "operational-full" ? "full" : readable.has(module) ? "read" : "none")
        : "full",
    })),
    organization_customers: [{ organization_id: ORG, customer_id: CUSTOMER, status: "active", alias: customerName, razon_social: customerName, email: "qa@example.invalid", contact_person: "QA Contacto ficticio", customers: customer }],
    equipment_models: [model], forklifts: [forklift], bookings: [booking],
    deliveries: [], booking_extensions: [], audit_logs: [], profiles: [], notifications: [], user_preferences: [], return_inspections: [], company_settings: [], drivers: [], maintenance_policies: [],
  };
}

function readServerFunctions(): Map<string, unknown> {
  const source = readdirSync("dist/server/_ssr").filter((file) => /^server-.*\.mjs$/.test(file))
    .map((file) => readFileSync(`dist/server/_ssr/${file}`, "utf8")).join("\n");
  const result = new Map<string, unknown>();
  for (const [name, payload] of Object.entries({
    getOrganizationContext: { context: { status: "ready", organizationId: ORG, memberType: "internal", customerId: null }, errorCode: null },
    getPlatformOperatorStatusFn: { isOperator: false },
  })) {
    const functionId = source.match(new RegExp(`"([a-f0-9]+)": \\{\\s*functionName: "${name}_createServerFn_handler"`))?.[1];
    if (!functionId) throw new Error(`Missing compiled read server function: ${name}`);
    result.set(functionId, { result: payload, context: {} });
  }
  return result;
}

export async function installBookingTransport(context: BrowserContext, origin: string, scenario: BookingScenario = {}) {
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local origin required");
  const functions = readServerFunctions();
  const rows = scenarioRows(scenario);
  const user = { id: USER, aud: "authenticated", role: "authenticated", email: "qa@example.invalid", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, amr: [{ method: "password", timestamp: now }] })}.synthetic-test-signature`, refresh_token: "synthetic-test-refresh", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user };
  await context.addInitScript(({ expectedOrigin, syntheticSession }) => {
    if (location.origin === expectedOrigin) localStorage.setItem("sb-127-auth-token", JSON.stringify(syntheticSession));
  }, { expectedOrigin: origin, syntheticSession: session });

  const unexpected: string[] = [], observed: string[] = [], externalBlocked: string[] = [];
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
    const json = (value: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(value) });
    const reject = () => { unexpected.push(`${method} ${url.pathname}`); return route.abort(); };
    if (url.origin === origin) {
      if (request.headers()["x-tsr-serverfn"] === "true" || url.pathname.includes("_serverFn")) {
        const functionId = url.pathname.split("/").pop() ?? "";
        if (method !== "GET" || !functions.has(functionId)) return reject();
        observed.push(`serverFn GET ${functionId}`);
        return json(functions.get(functionId));
      }
      if (method !== "GET") return reject();
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) return reject();
      return route.fulfill({ response });
    }
    if (url.origin !== BACKEND) { externalBlocked.push(`${method} ${url.origin}${url.pathname}`); return route.abort(); }
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/user" && method === "GET") return json(user);
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const rpc = url.pathname.slice("/rest/v1/rpc/".length);
      const reads: Record<string, unknown> = { get_organization_display_name: "QA Empresa ficticia", get_public_branding: [{ razon_social: "QA Empresa ficticia" }], get_sidebar_badge_counts: {} };
      if (Object.hasOwn(reads, rpc) && ["GET", "POST"].includes(method)) { observed.push(`read RPC ${rpc}`); return json(reads[rpc]); }
      if (rpc === "get_available_forklifts" && method === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        if (Object.keys(body).sort().join(",") !== "p_end_date,p_start_date" || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.p_start_date)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(body.p_end_date)) || String(body.p_start_date) > String(body.p_end_date)) return reject();
        observed.push(`read RPC ${rpc}`);
        return json(rows.forklifts);
      }
      return reject();
    }
    if (url.pathname.startsWith("/rest/v1/") && method === "GET") {
      const table = url.pathname.split("/").pop() ?? "";
      if (!Object.hasOwn(rows, table)) return reject();
      observed.push(`GET ${table}`);
      let result = rows[table];
      if (url.searchParams.has("id")) result = result.filter((row) => (row as { id: string }).id === url.searchParams.get("id")?.replace(/^eq\./, ""));
      return json(request.headers().accept?.includes("vnd.pgrst.object") ? (result[0] ?? null) : result);
    }
    return reject();
  });
  return { unexpected, observed, externalBlocked };
}
