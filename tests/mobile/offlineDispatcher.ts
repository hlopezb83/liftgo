import { Buffer } from "node:buffer";
import { readFileSync, readdirSync } from "node:fs";
import { expect, type BrowserContext } from "@playwright/test";

const BACKEND = "http://127.0.0.1:54321";
const USER = "00000000-0000-4000-8000-000000000001";
const ORG = "00000000-0000-4000-8000-000000000002";
const BOOKING = "00000000-0000-4000-8000-000000000003";
const FORKLIFT = "00000000-0000-4000-8000-000000000004";
const customer =
  "QA Móvil Cliente de prueba con nombre largo y varias palabras";
const equipment = {
  name: "QA Equipo de prueba con nombre largo y varias palabras",
  model: "QA-01",
};
const booking = {
  id: BOOKING,
  organization_id: ORG,
  booking_number: "QA-RES-001",
  customer_name: customer,
  forklift_id: FORKLIFT,
  forklifts: equipment,
  status: "confirmed",
  start_date: "2026-10-01",
  end_date: "2026-10-31",
  recurring_billing: false,
  last_billed_date: null,
  is_e2e: false,
};
const rows: Record<string, unknown[]> = {
  user_roles: [{ role: "dispatcher", user_id: USER }],
  role_permissions: [
    "Dashboard",
    "Flota",
    "Reservas",
    "Calendario",
    "Entregas",
    "Clientes",
    "Contratos",
    "Cotizaciones",
    "CRM / Prospectos",
    "Mantenimiento",
    "Daños",
    "Refacciones",
    "Proveedores",
    "Reportes",
    "Feedback",
    "Auditoría",
    "Configuración",
    "Gestión de Usuarios",
    "Facturas",
    "Pagos",
    "Gastos",
    "MRR",
    "Facturas de Proveedor",
    "Flujo de Caja",
    "Cuentas Bancarias",
    "Conciliación Bancaria",
  ].map((module) => ({
    role: "dispatcher",
    module,
    access_level: [
      "Dashboard",
      "Flota",
      "Reservas",
      "Calendario",
      "Entregas",
      "Clientes",
    ].includes(module)
      ? "read"
      : "none",
  })),
  bookings: [booking],
  forklifts: [{ id: FORKLIFT, ...equipment }],
  deliveries: [
    {
      id: "00000000-0000-4000-8000-000000000005",
      delivery_number: "QA-ENT-001",
      type: "delivery",
      status: "scheduled",
      forklift_id: FORKLIFT,
      forklifts: equipment,
      scheduled_date: "2026-10-21",
      scheduled_time: "10:00",
      address: "Calle ficticia 123, instalación ficticia QA",
      driver_name: "QA Operador ficticio",
      booking_id: BOOKING,
    },
  ],
  return_inspections: [
    {
      id: "00000000-0000-4000-8000-000000000006",
      inspection_number: "QA-DEV-001",
      forklift_id: FORKLIFT,
      forklifts: equipment,
      booking_id: BOOKING,
      bookings: booking,
      inspected_at: "2026-10-20T12:00:00Z",
      condition: "good",
      hours_reading: 100,
      notes: "Fixture local QA",
    },
  ],
  // DeliveryFormDialog mounts this read even when the dispatcher cannot write.
  drivers: [
    {
      id: "00000000-0000-4000-8000-000000000007",
      name: "QA Operador ficticio",
      is_active: true,
    },
  ],
  organization_customers: [],
  profiles: [],
  notifications: [],
  user_preferences: [],
};

// Resolve generated IDs from this exact compiled artifact, never hard-code a
// hash or inject application internals. Only these two read server functions
// are mocked; an unexpected server function fails closed.
function serverFunctionIds(): Map<string, unknown> {
  const files = readdirSync("dist/server/_ssr").filter((f) =>
    /^server-.*\.mjs$/.test(f),
  );
  const source = files
    .map((f) => readFileSync(`dist/server/_ssr/${f}`, "utf8"))
    .join("\n");
  const payloads: Record<string, unknown> = {
    getOrganizationContext: {
      context: {
        status: "ready",
        organizationId: ORG,
        memberType: "internal",
        customerId: null,
      },
      errorCode: null,
    },
    getPlatformOperatorStatusFn: { isOperator: false },
  };
  const result = new Map<string, unknown>();
  for (const [name, payload] of Object.entries(payloads)) {
    const id = source.match(
      new RegExp(
        `"([a-f0-9]+)": \\{\\s*functionName: "${name}_createServerFn_handler"`,
      ),
    )?.[1];
    if (!id) throw new Error(`Missing compiled read server function: ${name}`);
    result.set(id, { result: payload, context: {} });
  }
  return result;
}

export async function installOfflineDispatcher(
  context: BrowserContext,
  origin: string,
  authenticated = true,
) {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(
    new URL(origin).hostname,
  );
  const functions = authenticated
    ? serverFunctionIds()
    : new Map<string, unknown>();
  const unexpected: string[] = [];
  const observed = new Set<string>();
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const user = {
    id: USER,
    aud: "authenticated",
    role: "authenticated",
    email: "dispatcher@example.invalid",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER, aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, amr: [{ method: "password", timestamp: now }] })}.synthetic-test-signature`,
    refresh_token: "synthetic-test-refresh",
    expires_in: 3600,
    expires_at: now + 3600,
    token_type: "bearer",
    user,
  };
  if (authenticated)
    await context.addInitScript(
      ({ origin: target, session: data }) => {
        if (location.origin === target)
          localStorage.setItem("sb-127-auth-token", JSON.stringify(data));
      },
      { origin, session },
    );
  // No live realtime connections either.
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    };
    const json = (value: unknown) =>
      route.fulfill({
        status: 200,
        headers: cors,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    const reject = () => {
      unexpected.push(`${method} ${url.pathname}`);
      return route.abort();
    };
    if (url.origin === origin) {
      if (
        request.headers()["x-tsr-serverfn"] === "true" ||
        url.pathname.includes("_serverFn")
      ) {
        const id = url.pathname.split("/").pop()!;
        if (method !== "GET" || !functions.has(id)) return reject();
        observed.add(id);
        return json(functions.get(id));
      }
      return method === "GET" ? route.continue() : reject();
    }
    if (url.origin !== BACKEND) return route.abort();
    if (method === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/auth/v1/user" && method === "GET") return json(user);
    const rpc = url.pathname.replace("/rest/v1/rpc/", "");
    const readRpcs: Record<string, unknown> = {
      get_organization_display_name: "QA Empresa ficticia móvil",
      get_public_branding: [{ razon_social: "QA Empresa ficticia móvil" }],
      get_sidebar_badge_counts: {},
    };
    if (
      url.pathname.startsWith("/rest/v1/rpc/") &&
      rpc in readRpcs &&
      ["GET", "POST"].includes(method)
    )
      return json(readRpcs[rpc]);
    if (
      url.pathname.startsWith("/rest/v1/") &&
      method === "GET" &&
      !url.pathname.includes("/rpc/")
    ) {
      const table = url.pathname.split("/").pop()!;
      observed.add(table);
      // Unknown table reads are surfaced, not silently treated as empty success.
      if (!(table in rows)) return reject();
      return json(
        request.headers().accept?.includes("vnd.pgrst.object")
          ? (rows[table][0] ?? null)
          : rows[table],
      );
    }
    return reject();
  });
  return { unexpected, observed, bookingId: BOOKING };
}
