import { expect, test } from "bun:test";
import { guardOfflineEffects, guardOfflineFetch } from "./effectGuards";
import { offlineSdkFactory } from "./offlineWiring";
import { Facturapi } from "./candidate/_shared/facturapi/client";
import { createInvoiceGateway } from "./candidate/stamp-cfdi/invoiceGateway";
import type { OfficialClient } from "./officialCalls";
import { handleDownloadCfdi } from "./candidate/download-cfdi/handler";
import { attachOfflineConfigScope, TENANT } from "./testConfig";

function windowScope() {
  let open = true;
  const controller = new AbortController();
  return { scope: { checkpoint() { if (!open) throw new Error("VENTANA_CERRADA"); }, signal: controller.signal }, expire() { open = false; }, controller };
}
function deferred<T>() {
  let resolve: ((v: T) => void) | undefined;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve(v: T) { resolve?.(v); } };
}

test("builder construido abierto no envía al cerrarse antes del await", async () => {
  const w = windowScope(); let sent = 0;
  const builder = { eq() { return builder; }, then(resolve: (v: unknown) => unknown) { sent++; return Promise.resolve({ error: null }).then(resolve); } };
  const raw = { from() { return builder; } };
  const guarded = guardOfflineEffects(raw, w.scope);
  const query = guarded.from().eq(); w.expire();
  await expect(Promise.resolve(query)).rejects.toThrow("VENTANA_CERRADA");
  expect(sent).toBe(0);
});

test("lectura diferida vencida bloquea nueva escritura y retorno", async () => {
  const w = windowScope(); const pending = deferred<{ data: number }>(); let writes = 0;
  const raw = { async read() { return pending.promise; }, update() { writes++; } };
  const g = guardOfflineEffects(raw, w.scope); const read = g.read();
  w.expire(); pending.resolve({ data: 1 });
  await expect(read).rejects.toThrow("VENTANA_CERRADA");
  expect(() => g.update()).toThrow("VENTANA_CERRADA"); expect(writes).toBe(0);
});

test("Storage diferido vencido no inicia UPDATE posterior", async () => {
  const w = windowScope(); const upload = deferred<{ error: null }>(); let updates = 0; let uploads = 0;
  const raw = { storage: { from() { return { upload() { uploads++; return upload.promise; } }; } }, update() { updates++; } };
  const g = guardOfflineEffects(raw, w.scope);
  const effect = g.storage.from().upload().then(() => g.update());
  w.expire(); upload.resolve({ error: null });
  await expect(effect).rejects.toThrow("VENTANA_CERRADA");
  expect(uploads).toBe(1); expect(updates).toBe(0); // ya enviada no se deshace
});

test("RPC conserva this, nombre y args exactos; ningún retry", async () => {
  const w = windowScope(); const calls: unknown[] = [];
  const raw = { marker: "FICTICIO", async rpc(name: string, args: unknown) { calls.push([this.marker, name, args]); return { error: null }; } };
  const g = guardOfflineEffects(raw, w.scope);
  await g.rpc("check_and_record_rate_limit", { _max_requests: 30 });
  expect(calls).toEqual([["FICTICIO", "check_and_record_rate_limit", { _max_requests: 30 }]]);
});

test("fetch existente combina timeout y run; cuerpo tardío no retorna bytes", async () => {
  const w = windowScope(); const body = deferred<ArrayBuffer>(); let sends = 0; let signal: AbortSignal | undefined;
  const fake = async (_input: RequestInfo | URL, init?: RequestInit) => {
    sends++; signal = init?.signal as AbortSignal;
    const response = new Response("FICTICIO"); response.arrayBuffer = () => body.promise; return response;
  };
  const timeout = new AbortController();
  const fetchImpl = guardOfflineFetch(fake, w.scope);
  const response = await fetchImpl("https://offline.invalid", { signal: timeout.signal });
  const result = response.arrayBuffer(); w.expire(); body.resolve(new Uint8Array([1]).buffer);
  await expect(result).rejects.toThrow("VENTANA_CERRADA"); expect(sends).toBe(1);
  timeout.abort(); expect(signal?.aborted).toBe(true);
});

test("fetch cerrado no envía ninguna petición", async () => {
  const w = windowScope(); let sent = 0; w.expire();
  const f = guardOfflineFetch(async () => { sent++; return new Response(); }, w.scope);
  await expect(f("https://offline.invalid")).rejects.toThrow("VENTANA_CERRADA"); expect(sent).toBe(0);
});

for (const format of ["pdf", "xml"] as const) {
  test(`gateway auténtico ${format}: consumo diferido vencido no retorna archivo`, async () => {
    const w = windowScope(); const body = deferred<ArrayBuffer>();
    const client = new Facturapi("sk_test_FICTICIO_NO_UTILIZABLE") as OfficialClient;
    client.invoices.client.request = async () => ({ arrayBuffer: () => body.promise });
    const gateway = createInvoiceGateway("sk_test_FICTICIO_NO_UTILIZABLE", offlineSdkFactory(client, w.scope));
    let returned = 0;
    const result = (format === "pdf" ? gateway.downloadPdf("x") : gateway.downloadXml("x")).then(() => { returned++; });
    await new Promise((r) => setTimeout(r, 0)); w.expire(); body.resolve(new TextEncoder().encode("FICTICIO").buffer);
    await expect(result).rejects.toThrow("VENTANA_CERRADA"); expect(returned).toBe(0);
  });
}

for (const expireAt of ["none", "body", "upload"] as const) {
  test(`descarga NC auténtica con dobles: ${expireAt}, sin escritura posterior al cierre`, async () => {
    const w = windowScope(); let sends = 0; let uploads = 0; let updates = 0;
    const doc = "00000000-0000-4000-8000-000000000002";
    const db: unknown[] = [];
    const raw = {
      auth: { async getClaims() { return { data: { claims: { sub: doc } }, error: null }; } },
      async rpc() { return { data: true, error: null }; },
      from(table: string) {
        let patch = false;
        const result = () => {
          const rows: Record<string, unknown> = {
            profiles: { is_active: true }, user_roles: { role: "admin" },
            organization_memberships: [{ organization_id: TENANT, member_type: "internal" }],
            organizations: [{ is_active: true }], company_settings: { facturapi_mode: "test" },
            billing_secrets: { facturapi_test_key: "sk_test_FICTICIO_NO_UTILIZABLE" },
            credit_notes: { id: doc, organization_id: TENANT, cfdi_status: "stamped", cfdi_uuid: "UUID_FICTICIO", facturapi_invoice_id: "FICTICIO" },
          };
          return { data: patch ? null : rows[table], error: null };
        };
        const q = {
          select(v: unknown) { db.push([table, "select", v]); return q; },
          eq(k: string, v: unknown) { db.push([table, "eq", k, v]); return q; },
          in() { return q; }, limit() { return q; },
          update(v: unknown) { updates++; patch = true; db.push([table, "update", v]); return q; },
          async single() { return result(); }, async maybeSingle() { return result(); },
          then(resolve: (v: unknown) => unknown) { return Promise.resolve(result()).then(resolve); },
        }; return q;
      },
      storage: { from() { return {
        async download() { return { data: null, error: null }; },
        async upload() { uploads++; if (expireAt === "upload") w.expire(); return { error: null }; },
      }; } },
    };
    const admin = guardOfflineEffects(raw, w.scope);
    attachOfflineConfigScope(admin, { ...w.scope, async loadVerifier() { return async () => true; } });
    const fake = async () => {
      sends++; const r = new Response("PDF_FICTICIO");
      r.arrayBuffer = async () => { if (expireAt === "body") w.expire(); return new TextEncoder().encode("PDF_FICTICIO").buffer; }; return r;
    };
    const deps = { createCallerClient: () => admin, createServiceClient: () => admin, fetchImpl: guardOfflineFetch(fake, w.scope), env() { throw new Error("ENTORNO_PROHIBIDO"); } };
    const response = await handleDownloadCfdi(new Request("https://offline.invalid", { method: "POST", headers: { Authorization: "Bearer FICTICIO", "Content-Type": "application/json" }, body: JSON.stringify({ credit_note_id: doc, format: "pdf" }) }), deps as unknown as Parameters<typeof handleDownloadCfdi>[1]);
    expect(sends).toBe(1);
    expect(uploads).toBe(expireAt === "body" ? 0 : 1);
    expect(updates).toBe(expireAt === "none" ? 1 : 0);
    expect(response.status).toBe(expireAt === "none" ? 200 : expireAt === "body" ? 502 : 500);
    if (expireAt === "none") expect(await response.text()).toBe("PDF_FICTICIO");
    expect(db).toContainEqual(["credit_notes", "eq", "id", doc]);
    expect(db).toContainEqual(["billing_secrets", "select", "facturapi_test_key"]);
    expect(db).toContainEqual(["billing_secrets", "eq", "organization_id", TENANT]);
  });
}

test("Request conserva señal y streams/clones no revisados fallan cerrados", async () => {
  const w = windowScope(); const requestAbort = new AbortController(); let actual: AbortSignal | null | undefined;
  const f = guardOfflineFetch(async (_input, init) => { actual = init?.signal; return new Response("FICTICIO"); }, w.scope);
  const response = await f(new Request("https://offline.invalid", { signal: requestAbort.signal }));
  requestAbort.abort(); expect(actual?.aborted).toBe(true);
  expect(() => response.body).toThrow("QA_STREAM_OR_CLONE_UNREVIEWED");
  expect(() => response.clone()).toThrow("QA_STREAM_OR_CLONE_UNREVIEWED");
});