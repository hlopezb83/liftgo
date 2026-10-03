import { strict as assert } from "node:assert";
import { handleRequest } from "./index.ts";
import { INVOICE_ID, testDatabase } from "./testDatabase.ts";

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
