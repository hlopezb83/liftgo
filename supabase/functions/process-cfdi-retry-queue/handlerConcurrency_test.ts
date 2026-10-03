import { strict as assert } from "node:assert";
import { handleRequest, type HandleRequestDeps } from "./index.ts";
import { ORG_B, testDatabase } from "./testDatabase.ts";

function fixture() {
  const database = testDatabase();
  let lookups = 0;
  let invocations = 0;
  const deps: HandleRequestDeps = {
    admin: database.admin,
    env: (key) =>
      key === "SUPABASE_SERVICE_ROLE_KEY"
        ? "synthetic-service"
        : key === "SUPABASE_PROJECT_ID"
        ? "synthetic-project"
        : undefined,
    authenticate: () => Promise.resolve({ ok: true, via: "cron_secret" }),
    lookup: () => {
      lookups++;
      return Promise.resolve({
        kind: "pending",
        facturapi_id: "provider-pending",
      });
    },
    fetch: () => {
      invocations++;
      return Promise.resolve(new Response("{}", { status: 200 }));
    },
  };
  const run = async () => {
    const response = await handleRequest(
      new Request("https://example.invalid/queue", { method: "POST" }),
      deps,
    );
    assert.equal(response.status, 200);
    return await response.json() as { results: Array<{ status: string }> };
  };
  return { ...database, deps, run, calls: () => ({ lookups, invocations }) };
}

Deno.test("queue handler: factura recuperada guardada antes de cerrar la cola, sin otro timbrado", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.results[0].status, "succeeded_pac_pending");
  assert.equal(f.tables.cfdi_retry_queue[0].status, "succeeded");
  assert.equal(f.tables.invoices[0].cfdi_status, "stamping");
  assert.equal(f.tables.invoices[0].facturapi_env, "test");
  assert.equal(f.tables.invoices[0].cfdi_uuid, null);
  assert.deepEqual(f.calls(), { lookups: 1, invocations: 0 });
});

Deno.test("queue handler: fallo al guardar recuperación no cierra la cola ni consume intento", async () => {
  const f = fixture();
  f.failQuery((query) => query.table === "invoices" && !!query.patch);
  const result = await f.run();
  assert.equal(result.results[0].status, "recovery_write_error");
  assert.equal(f.tables.cfdi_retry_queue[0].status, "pending");
  assert.equal(f.tables.cfdi_retry_queue[0].attempts, 2);
  assert.equal(f.tables.invoices[0].facturapi_invoice_id, null);
  assert.deepEqual(f.calls(), { lookups: 1, invocations: 0 });
});

Deno.test("queue handler: cambio de dueño durante lookup conserva la nueva reserva y el documento", async () => {
  const f = fixture();
  f.deps.lookup = () => {
    Object.assign(f.tables.cfdi_retry_queue[0], {
      status: "processing",
      updated_at: "2026-10-03T14:00:00Z",
      attempts: 4,
    });
    return Promise.resolve({ kind: "pending", facturapi_id: "old-result" });
  };
  const result = await f.run();
  assert.equal(result.results[0].status, "lease_lost");
  assert.equal(f.tables.cfdi_retry_queue[0].attempts, 4);
  assert.equal(f.tables.cfdi_retry_queue[0].status, "processing");
  assert.equal(f.tables.invoices[0].facturapi_invoice_id, null);
});

Deno.test("queue handler: referencia de factura de otra empresa termina antes de secretos o PAC", async () => {
  const f = fixture();
  f.tables.invoices[0].organization_id = ORG_B;
  const result = await f.run();
  assert.equal(result.results[0].status, "exhausted");
  assert.equal(
    f.queries.some((query) => query.table === "billing_secrets"),
    false,
  );
  assert.deepEqual(f.calls(), { lookups: 0, invocations: 0 });
});

Deno.test("queue handler: una terminación rechazada no se anuncia como éxito ni se repite", async () => {
  const f = fixture();
  f.tables.cfdi_retry_queue[0].operation = "cancel";
  f.failQuery((query) =>
    query.table === "cfdi_retry_queue" && query.patch?.status === "succeeded"
  );
  const result = await f.run();
  assert.equal(result.results[0].status, "queue_write_error");
  assert.equal(f.tables.cfdi_retry_queue[0].status, "processing");
  assert.deepEqual(f.calls(), { lookups: 0, invocations: 1 });
});

Deno.test("queue handler: cancelaciones rechazan el documento de otra empresa antes de llamar a la función", async () => {
  for (
    const [operation, table] of [["cancel", "invoices"], [
      "cancel_nc",
      "credit_notes",
    ], ["cancel_rep", "payments"]]
  ) {
    const f = fixture();
    f.tables.cfdi_retry_queue[0].operation = operation;
    f.tables[table] = [{ ...f.tables.invoices[0], organization_id: ORG_B }];
    assert.equal((await f.run()).results[0].status, "document_unavailable");
    assert.deepEqual(f.calls(), { lookups: 0, invocations: 0 });
  }
});
