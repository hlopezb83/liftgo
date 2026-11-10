import { test, expect } from "bun:test";
import { Facturapi } from "./candidate/_shared/facturapi/client";
import { handleRefreshCancellation } from "./candidate/refresh-cancellation-status/handler";
import { createInvoiceGateway } from "./candidate/stamp-cfdi/invoiceGateway";
import { offlineSdkFactory } from "./offlineWiring";
import { attachOfflineConfigScope, TENANT } from "./testConfig";
import type { OfficialClient } from "./officialCalls";

const USER = "00000000-0000-4000-8000-000000000001";
const DOC = "00000000-0000-4000-8000-000000000002";
const forbidden = () => { throw new Error("RED_O_STORAGE_PROHIBIDOS"); };

function scenario(options: { guarded?: boolean; prior?: string; returned?: string; updateError?: boolean; expireDuringSdk?: boolean; crossTenant?: boolean; missingScope?: boolean } = {}) {
  const db: unknown[][] = []; const sdk: unknown[][] = [];
  let open = true;
  const controller = new AbortController();
  const scope = { checkpoint() { if (!open) throw new Error("VENTANA_CERRADA"); }, signal: controller.signal };
  const client = new Facturapi("sk_test_FICTICIO_NO_UTILIZABLE") as OfficialClient;
  client.invoices.client.request = async (path, opts = {}) => {
    const { signal: _signal, ...normalized } = opts;
    sdk.push([path, normalized]);
    if (options.expireDuringSdk) open = false;
    return { id: "FICTICIO", cancellation_status: options.returned ?? "pending", status: "valid" };
  };
  // Todos los accesos son dobles; se registran consultas, filtros y escrituras.
  const admin = {
    auth: { async getClaims(_token: string) { return { data: { claims: { sub: USER, role: "authenticated" } }, error: null }; } },
    from(table: string) {
      db.push(["from", table]);
      let patch: Record<string, unknown> | undefined;
      const result = () => {
        if (patch) return { data: null, error: options.updateError ? "FALLA_FICTICIA" : null };
        const row: Record<string, unknown> = {
          profiles: { is_active: true },
          user_roles: [{ role: "admin" }],
          organization_memberships: [{ organization_id: TENANT, member_type: "internal" }],
          organizations: [{ is_active: true }],
          company_settings: { facturapi_mode: "test" },
          billing_secrets: { facturapi_test_key: "sk_test_FICTICIO_NO_UTILIZABLE" },
          invoices: { facturapi_invoice_id: "FICTICIO", organization_id: options.crossTenant ? "OTRA_EMPRESA_FICTICIA" : TENANT, cancellation_status: options.prior ?? "pending" },
        };
        return { data: row[table] ?? null, error: null };
      };
      const q = {
        select(value?: string) { db.push(["select", value]); return q; },
        eq(column: string, value: unknown) { db.push(["eq", column, value]); return q; },
        limit(value: number) { db.push(["limit", value]); return q; },
        update(value: Record<string, unknown>) { scope.checkpoint(); patch = value; db.push(["update", value]); return q; },
        async single() { return result(); }, async maybeSingle() { return result(); },
        then(resolve: (v: ReturnType<typeof result>) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return q;
    },
    storage: { from: forbidden },
  };
  if (!options.missingScope) attachOfflineConfigScope(admin, { ...scope, async loadVerifier() { return async () => true; } });
  const deps = {
    createCallerClient: () => admin, createServiceClient: () => admin,
    createQaClient: options.guarded === false ? () => client : offlineSdkFactory(client, scope),
    fetchImpl: forbidden, env: forbidden,
  };
  const run = () => handleRefreshCancellation(new Request("https://offline.invalid", {
    method: "POST", headers: { Authorization: "Bearer FICTICIO_NO_ES_JWT", "Content-Type": "application/json" }, body: JSON.stringify({ invoice_id: DOC }),
  }), deps as unknown as Parameters<typeof handleRefreshCancellation>[1]);
  return { run, db, sdk };
}

test("refresco auténtico autenticado ficticio: paridad de respuesta y persistencia pending", async () => {
  const a = scenario(); const b = scenario({ guarded: false });
  const ar = await a.run(); const br = await b.run();
  expect(ar.status).toBe(200); expect(br.status).toBe(200);
  expect(await ar.json()).toEqual(await br.json());
  expect(a.db).toEqual(b.db); expect(a.sdk).toEqual(b.sdk);
  expect(a.sdk.length).toBe(1);
  expect(a.sdk[0]?.[0]).toBe("/invoices/FICTICIO/status");
  expect(a.db.slice(-3)).toEqual([["from", "invoices"], ["update", { cancellation_status: "pending" }], ["eq", "id", DOC]]);
  expect(a.db).toContainEqual(["eq", "auth_user_id", USER]);
  expect(a.db).toContainEqual(["eq", "member_type", "internal"]);
  expect(a.db).toContainEqual(["eq", "organization_id", TENANT]);
});

test("refresco no degrada accepted a pending", async () => {
  const f = scenario({ prior: "accepted" }); const r = await f.run();
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ success: true, cancellation_status: "accepted" });
  const update = f.db.find((x) => x[0] === "update")?.[1] as Record<string, unknown>;
  expect(update.cfdi_status).toBe("cancelled");
  expect(update.status).toBe("cancelled");
  expect(typeof update.cancelled_at).toBe("string");
});

test("fallo de persistencia no responde éxito", async () => {
  const f = scenario({ updateError: true });
  expect((await f.run()).status).toBe(500);
  expect(f.sdk.length).toBe(1);
});

test("vencimiento durante SDK bloquea fallback retrieve y escritura posterior", async () => {
  const f = scenario({ expireDuringSdk: true });
  expect((await f.run()).status).toBe(502);
  expect(f.sdk.length).toBe(1);
  expect(f.db.some((x) => x[0] === "update")).toBe(false);
});

test("tenant ajeno rechazado antes de secreto o SDK", async () => {
  const f = scenario({ crossTenant: true });
  expect((await f.run()).status).toBe(403);
  expect(f.sdk.length).toBe(0);
  expect(f.db).not.toContainEqual(["from", "billing_secrets"]);
});

test("scope ausente no usa fábrica inyectada ni secreto", async () => {
  const f = scenario({ missingScope: true });
  expect((await f.run()).status).toBe(503);
  expect(f.sdk.length).toBe(0);
  expect(f.db).not.toContainEqual(["from", "billing_secrets"]);
});

test("gateway auténtico conecta create/PDF/XML al mismo gate y respeta timeout independiente", async () => {
  const client = new Facturapi("sk_test_FICTICIO_NO_UTILIZABLE") as OfficialClient;
  const calls: Array<{ path: string; signal: unknown }> = [];
  client.invoices.client.request = async (path, opts = {}) => {
    calls.push({ path, signal: opts.signal });
    return path.endsWith("/pdf") ? new Uint8Array([37, 80, 68, 70]) : path.endsWith("/xml") ? "<FICTICIO/>" : { id: "FICTICIO", status: "valid" };
  };
  const run = new AbortController(); const perCall = new AbortController();
  const gateway = createInvoiceGateway("sk_test_FICTICIO_NO_UTILIZABLE", offlineSdkFactory(client, { checkpoint() {}, signal: run.signal }));
  await gateway.create({ type: "I" }, { signal: perCall.signal });
  expect(await gateway.downloadXml("x")).toBe("<FICTICIO/>");
  expect(await gateway.downloadPdf("x")).toEqual(new Uint8Array([37, 80, 68, 70]));
  const combined = calls[0]?.signal as AbortSignal;
  expect(combined.aborted).toBe(false); perCall.abort(); expect(combined.aborted).toBe(true);
  expect(calls[1]?.signal).toBe(run.signal); expect(calls[2]?.signal).toBe(run.signal);
});