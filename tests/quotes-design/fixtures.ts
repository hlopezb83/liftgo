import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";

const BACKEND = "http://127.0.0.1:54321";
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const USER = id(1), ORG = id(2), CUSTOMER = id(31), MODEL = id(41);
export const quoteMxnId = id(51), quoteUsdId = id(52), quoteAcceptedId = id(53);
export const customerName = "QA Cliente ficticio con razón social larga para cotizaciones de equipo y maniobras";
export const modelName = "Modelo ficticio de nombre largo 2500 para operación de almacén con pasillos estrechos";
export const modelLabel = `QA - ${modelName}`;
export const detailDescription = "QA Modelo ficticio de nombre largo 2500 — Renta mensual para maniobras en instalación ficticia con descripción completa accesible";

const model = {
  id: MODEL, organization_id: ORG, manufacturer: "QA", model: modelName, is_active: true,
  default_daily_rate: 1000, default_weekly_rate: 5000, default_monthly_rate: 15000,
  default_capacity_kg: 2500, default_mast_height_m: 4.5, default_fuel_type: "electric",
};
const customer = {
  id: CUSTOMER, name: customerName, company: customerName, created_by_organization_id: ORG,
  rfc: "AAA010101AAA", email: "qa@example.invalid", contact_person: "QA Contacto ficticio", version: 1,
};
const lineItems = [
  { line_kind: "rental", description: detailDescription, quantity: 2, unit_price: 15000, total: 30000, discount: 10, discount_type: "%" },
  { line_kind: "charge", charge_kind: "logistics", charge_id: id(61), description: "QA Logística ficticia de traslado, entrega y recuperación de equipo con texto extenso", quantity: 1, unit_price: 1250, total: 1250, discount: 250, discount_type: "$" },
  { line_kind: "charge", charge_kind: "insurance", charge_id: id(62), description: "QA Seguro ficticio durante el período cotizado", quantity: 1, unit_price: 1000, total: 1000, discount: 0, discount_type: "%" },
  ...Array.from({ length: 4 }, (_, index) => ({
    line_kind: "rental", description: `QA Partida ficticia adicional ${index + 1} con descripción larga para verificar jerarquía y desplazamiento del resumen`,
    quantity: 1, unit_price: 500, total: 500, discount: 0, discount_type: "%",
  })),
];
const quote = {
  organization_id: ORG, customer_id: CUSTOMER, customer_name: customerName, quote_type: "rental", status: "draft",
  start_date: "2026-11-01", end_date: "2026-11-30", valid_until: "2026-12-31",
  subtotal: 31000, tax_rate: 16, tax_amount: 4960, total: 35960,
  tipo_cambio: 1, rental_meta: [{ modelId: MODEL, quantity: 2 }], line_items: lineItems,
  notes: "Fixture local ficticio. Ningún dato operativo. Texto largo para revisar notas sin ocultar importes ni acciones.",
  version: 7, created_at: "2026-10-01T12:00:00Z", accepted_at: null,
};

export interface QuoteTransportOptions { readOnly?: boolean }

/** Synthetic local identity only. Every unexpected request and every write is aborted. */
export async function installQuoteTransport(context: BrowserContext, origin: string, options: QuoteTransportOptions = {}) {
  if (origin !== "http://127.0.0.1:4187") throw new Error("[quotes-design] Exact isolated local origin required.");
  const rows: Record<string, unknown[]> = {
    user_roles: [{ role: "admin", user_id: USER }],
    role_permissions: ["Dashboard", "Flota", "Reservas", "Calendario", "Entregas", "Clientes", "Contratos", "Cotizaciones", "Facturas", "Pagos", "Configuración", "Facturas de Proveedor"]
      .map((module) => ({ role: "admin", module, access_level: options.readOnly ? "read" : "full" })),
    organization_customers: [{
      organization_id: ORG, status: "active", alias: customerName, razon_social: customerName,
      rfc: "AAA010101AAA", regimen_fiscal: "601", uso_cfdi: "G03", domicilio_fiscal_cp: "64000", tax_rate: 16,
      contact_person: "QA Contacto ficticio", email: "qa@example.invalid", customers: customer,
    }],
    equipment_models: [model],
    quotes: [
      { ...quote, id: quoteMxnId, quote_number: "QA-COT-MXN", currency: "MXN" },
      { ...quote, id: quoteUsdId, quote_number: "QA-COT-USD", currency: "USD", tipo_cambio: 18.5 },
      { ...quote, id: quoteAcceptedId, quote_number: "QA-COT-ACEPTADA", currency: "USD", tipo_cambio: 18.5, status: "accepted", accepted_at: "2026-10-20T12:00:00Z" },
    ],
    forklifts: [], bookings: [], invoices: [], quote_assigned_forklifts: [], deliveries: [], booking_extensions: [],
    audit_logs: [], profiles: [], notifications: [], user_preferences: [], return_inspections: [],
    invoice_bookings: [], company_settings: [], drivers: [],
  };

  const compiled = readdirSync("dist/server/_ssr").filter((file) => /^server-.*\.mjs$/.test(file))
    .map((file) => readFileSync(`dist/server/_ssr/${file}`, "utf8")).join("\n");
  const functions = new Map<string, unknown>();
  for (const [name, payload] of Object.entries({
    getOrganizationContext: { context: { status: "ready", organizationId: ORG, memberType: "internal", customerId: null }, errorCode: null },
    getPlatformOperatorStatusFn: { isOperator: false },
  })) {
    const key = compiled.match(new RegExp(`"([a-f0-9]+)": \\{\\s*functionName: "${name}_createServerFn_handler"`))?.[1];
    if (!key) throw new Error(`[quotes-design] Missing allowed read server function ${name}`);
    functions.set(key, { result: payload, context: {} });
  }
  const user = {
    id: USER, aud: "authenticated", role: "authenticated", email: "qa@example.invalid",
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z",
  };
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, amr: [{ method: "password", timestamp: now }] })}.synthetic-test-signature`,
    refresh_token: "synthetic-test-refresh", expires_in: 3600, expires_at: now + 3600, token_type: "bearer", user,
  };
  await context.addInitScript(({ origin, session }) => {
    if (location.origin === origin) localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
  }, { origin, session });

  const unexpected: string[] = [], observed: string[] = [], externalBlocked: string[] = [], blockedWrites: string[] = [], blockedWebSockets: string[] = [];
  await context.routeWebSocket("**/*", (socket) => { blockedWebSockets.push(socket.url()); socket.close(); });
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const signature = `${method} ${url.origin}${url.pathname}`;
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "*", "access-control-allow-methods": "GET, POST, OPTIONS" };
    const json = (value: unknown) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(value) });
    const reject = (isWrite = false) => {
      unexpected.push(signature);
      if (isWrite) blockedWrites.push(signature);
      return route.abort();
    };
    if (url.origin === origin) {
      if (request.headers()["x-tsr-serverfn"] === "true" || url.pathname.includes("_serverFn")) {
        const key = url.pathname.split("/").pop()!;
        if (method !== "GET" || !functions.has(key)) return reject(method !== "GET");
        observed.push(`serverFn GET ${key}`);
        return json(functions.get(key));
      }
      if (method !== "GET") return reject(true);
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() >= 300 && response.status() < 400) return reject();
      return route.fulfill({ response });
    }
    if (url.origin !== BACKEND) { externalBlocked.push(signature); return route.abort(); }
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/user" && method === "GET") { observed.push("synthetic auth user GET"); return json(user); }
    const rpc = url.pathname.replace("/rest/v1/rpc/", "");
    // These three named RPCs are read-only. No other POST is ever allowed.
    const reads: Record<string, unknown> = {
      get_organization_display_name: "QA Empresa ficticia", get_public_branding: [{ razon_social: "QA Empresa ficticia" }], get_sidebar_badge_counts: {},
    };
    if (url.pathname.startsWith("/rest/v1/rpc/") && rpc in reads && ["GET", "POST"].includes(method)) {
      observed.push(`read RPC ${rpc}`); return json(reads[rpc]);
    }
    if (method !== "GET") return reject(true);
    if (url.pathname.startsWith("/rest/v1/") && !url.pathname.includes("/rpc/")) {
      const table = url.pathname.split("/").pop()!;
      if (!(table in rows)) return reject();
      observed.push(`GET ${table}`);
      let result = rows[table];
      if (url.searchParams.has("id")) result = result.filter((row) => (row as { id: string }).id === url.searchParams.get("id")!.replace(/^eq\./, ""));
      return json(request.headers().accept?.includes("vnd.pgrst.object") ? result[0] ?? null : result);
    }
    return reject();
  });
  return { unexpected, observed, externalBlocked, blockedWrites, blockedWebSockets };
}
