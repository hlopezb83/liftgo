import { strict as assert } from "node:assert";
import { handleRequest } from "./index.ts";
import { INVOICE_ID, testDatabase } from "./testDatabase.ts";
import { handleStampCfdi } from "../stamp-cfdi/handler.ts";
import type { SupabaseLike } from "../_shared/types.ts";

/** SDK Facturapi real; fetch queda en memoria y no sale a ningún proveedor. */
async function runWithProvider(
  mutate: (db: ReturnType<typeof testDatabase>) => void,
  failSave = false,
) {
  const db = testDatabase();
  const originalFetch = globalThis.fetch;
  const previousSecret = Deno.env.get("CRON_SECRET");
  let providerReads = 0;
  Deno.env.set("CRON_SECRET", "synthetic-cron-fixture-only");
  globalThis.fetch = (input) => {
    assert.match(
      String(input),
      /^https:\/\/www\.facturapi\.io\/v2\/invoices\?/,
    );
    providerReads++;
    mutate(db);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: [{
            id: "provider-recovered",
            status: "pending",
            external_id: INVOICE_ID,
          }],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
  };
  if (failSave) {
    db.failQuery((query) => query.table === "invoices" && !!query.patch);
  }
  try {
    const response = await handleRequest(
      new Request("https://example.invalid/queue", {
        method: "POST",
        headers: { "x-cron-secret": "synthetic-cron-fixture-only" },
      }),
      {
        admin: db.admin,
        env: (key) =>
          key === "SUPABASE_SERVICE_ROLE_KEY"
            ? "synthetic-service"
            : key === "SUPABASE_PROJECT_ID"
            ? "synthetic-project"
            : undefined,
      },
    );
    assert.equal(response.status, 200);
    const result = await response.json() as {
      results: Array<{ status: string }>;
    };
    return { db, result, providerReads };
  } finally {
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) Deno.env.delete("CRON_SECRET");
    else Deno.env.set("CRON_SECRET", previousSecret);
  }
}

Deno.test("queue PAC real offline: otro dueño durante GET impide guardar el resultado antiguo", async () => {
  const { db, result, providerReads } = await runWithProvider((db) => {
    Object.assign(db.tables.cfdi_retry_queue[0], {
      status: "processing",
      updated_at: "2026-10-03T16:00:00Z",
      attempts: 4,
    });
  });
  assert.equal(providerReads, 1);
  assert.equal(result.results[0].status, "lease_lost");
  assert.equal(db.tables.cfdi_retry_queue[0].status, "processing");
  assert.equal(db.tables.cfdi_retry_queue[0].attempts, 4);
  assert.equal(db.tables.invoices[0].facturapi_invoice_id, null);
});

Deno.test("queue PAC real offline: recuperación no guardada permanece pendiente sin otro timbrado", async () => {
  const { db, result, providerReads } = await runWithProvider(() => {}, true);
  assert.equal(providerReads, 1);
  assert.equal(result.results[0].status, "recovery_write_error");
  assert.equal(db.tables.cfdi_retry_queue[0].status, "pending");
  assert.equal(db.tables.cfdi_retry_queue[0].attempts, 2);
  assert.equal(db.tables.invoices[0].facturapi_invoice_id, null);
});

Deno.test("queue y timbrado reales: rotación durante GET bloquea la nueva llave antes de emitir", async () => {
  const db = testDatabase();
  Object.assign(db.tables.invoices[0], {
    total: 116,
    subtotal: 100,
    tax_rate: 16,
    line_items: [{
      description: "Renta de montacargas",
      quantity: 1,
      unit_price: 100,
    }],
    receptor_rfc: "AAA010101AA1",
    receptor_razon_social: "Empresa de prueba CI",
    receptor_regimen_fiscal: "601",
    receptor_domicilio_fiscal_cp: "64000",
  });
  const originalFetch = globalThis.fetch;
  let gets = 0;
  let posts = 0;
  let childStatus = 0;
  let providerPosts = 0;
  globalThis.fetch = (input, init) => {
    assert.match(
      String(input),
      /^https:\/\/www\.facturapi\.io\/v2\/invoices(?:\?|$)/,
    );
    if (init?.method === "POST") {
      providerPosts++;
      assert.equal(
        new Headers(init.headers).get("Authorization"),
        "Bearer sk_test_rotated_fixture_only",
      );
      return Promise.resolve(
        Response.json({ id: "wrong-namespace-provider", status: "pending" }, {
          status: 202,
        }),
      );
    }
    assert.equal(init?.method, "GET");
    gets++;
    db.tables.billing_secrets[0].facturapi_test_key =
      "sk_test_rotated_fixture_only";
    return Promise.resolve(Response.json({ data: [] }));
  };
  const service = db.admin as unknown as SupabaseLike;
  const caller = {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: { claims: { role: "service_role" } },
          error: null,
        }),
    },
  } as unknown as SupabaseLike;
  try {
    const response = await handleRequest(
      new Request("https://example.invalid/queue"),
      {
        admin: db.admin,
        authenticate: () => Promise.resolve({ ok: true, via: "cron_secret" }),
        env: (key) =>
          key === "SUPABASE_SERVICE_ROLE_KEY"
            ? "synthetic-service"
            : key === "SUPABASE_PROJECT_ID"
            ? "synthetic-project"
            : undefined,
        fetch: async (input, init) => {
          posts++;
          assert.match(String(input), /\/stamp-cfdi$/);
          const result = await handleStampCfdi(
            new Request(String(input), init),
            {
              createCallerClient: () => caller,
              createServiceClient: () => service,
              fetchImpl: globalThis.fetch,
              env: () => undefined,
            },
          );
          childStatus = result.status;
          return result;
        },
      },
    );
    const result = await response.json();
    assert.equal(gets, 1);
    assert.equal(posts, 1);
    assert.equal(childStatus, 412);
    assert.equal(providerPosts, 0);
    assert.equal(result.results[0].status, "FISCAL_RETRY_CHANGED");
    assert.equal(db.tables.cfdi_retry_queue[0].status, "exhausted");
    assert.equal(db.tables.cfdi_retry_queue[0].attempts, 2);
    assert.equal(db.tables.invoices[0].facturapi_invoice_id, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
