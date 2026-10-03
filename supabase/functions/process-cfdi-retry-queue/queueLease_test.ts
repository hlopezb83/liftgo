import { strict as assert } from "node:assert";
import {
  assertOwnedQueue,
  claimQueueLease,
  markOwnedQueueRow,
  QueueMutationError,
  type QueueSnapshot,
} from "./queueLease.ts";
import {
  InvoiceRecoveryError,
  type RecoveryInvoice,
  saveRecoveredInvoice,
} from "./recoveredInvoice.ts";
import {
  INVOICE_ID,
  ORG_A,
  ORG_B,
  testDatabase,
  VERSION,
} from "./testDatabase.ts";

Deno.test("queue lease: un solo consumidor obtiene una fila huérfana y usa el token real del trigger", async () => {
  const f = testDatabase();
  f.tables.cfdi_retry_queue[0].status = "processing";
  const snapshot = { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot;
  const claims = await Promise.all([
    claimQueueLease(f.admin, snapshot, "2026-10-03T10:00:00Z"),
    claimQueueLease(f.admin, snapshot, "2026-10-03T10:00:00Z"),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(claims[0]?.updatedAt, f.tables.cfdi_retry_queue[0].updated_at);
  assert.notEqual(claims[0]?.updatedAt, "2026-10-03T10:00:00Z");
});

Deno.test("queue lease: un worker viejo no termina una reprogramación con el mismo estado processing", async () => {
  const f = testDatabase();
  const lease = (await claimQueueLease(
    f.admin,
    { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot,
    VERSION,
  ))!;
  const row = f.tables.cfdi_retry_queue[0];
  row.updated_at = "2026-10-03T13:00:00Z";
  row.attempts = 3;
  const before = { ...row };
  await assert.rejects(
    markOwnedQueueRow(f.admin, lease, { status: "succeeded", attempts: 9 }),
    (error: unknown) =>
      error instanceof QueueMutationError && error.kind === "lease_lost",
  );
  await assert.rejects(
    assertOwnedQueue(f.admin, lease),
    (error: unknown) => error instanceof QueueMutationError,
  );
  assert.deepEqual(row, before);
});

Deno.test("queue lease: falla la BD o falta RETURNING y no informa un guardado exitoso", async () => {
  const f = testDatabase();
  const lease = (await claimQueueLease(
    f.admin,
    { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot,
    VERSION,
  ))!;
  f.failQuery((query) => !!query.patch);
  await assert.rejects(
    markOwnedQueueRow(f.admin, lease, { status: "succeeded" }),
    (error: unknown) =>
      error instanceof QueueMutationError && error.kind === "queue_write_error",
  );
  assert.equal(f.tables.cfdi_retry_queue[0].status, "processing");
});

Deno.test("queue lease: la empresa es parte del claim y de cada terminación", async () => {
  const f = testDatabase();
  const snapshot = {
    ...f.tables.cfdi_retry_queue[0],
    organization_id: ORG_B,
  } as QueueSnapshot;
  assert.equal(await claimQueueLease(f.admin, snapshot, VERSION), null);
  const lease = (await claimQueueLease(
    f.admin,
    { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot,
    VERSION,
  ))!;
  await assert.rejects(
    markOwnedQueueRow(f.admin, { ...lease, organizationId: ORG_B }, {
      status: "exhausted",
    }),
  );
  assert.equal(f.tables.cfdi_retry_queue[0].status, "processing");
});

Deno.test("queue recovery: 202 conserva ID y ambiente sin inventar UUID ni estado stamped", async () => {
  const f = testDatabase();
  const lease = (await claimQueueLease(
    f.admin,
    { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot,
    VERSION,
  ))!;
  await saveRecoveredInvoice(
    f.admin,
    lease,
    INVOICE_ID,
    { ...f.tables.invoices[0] } as RecoveryInvoice,
    { kind: "pending", facturapi_id: "provider-202" },
    "test",
  );
  assert.equal(f.tables.invoices[0].facturapi_invoice_id, "provider-202");
  assert.equal(f.tables.invoices[0].facturapi_env, "test");
  assert.equal(f.tables.invoices[0].cfdi_uuid, null);
  assert.equal(f.tables.invoices[0].cfdi_status, "stamping");
});

Deno.test("queue recovery: conserva un CFDI cambiado durante el GET del PAC", async () => {
  const f = testDatabase();
  const lease = (await claimQueueLease(
    f.admin,
    { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot,
    VERSION,
  ))!;
  const snapshot = { ...f.tables.invoices[0] } as RecoveryInvoice;
  Object.assign(f.tables.invoices[0], {
    cfdi_uuid: "new-uuid",
    facturapi_invoice_id: "new-provider",
    cfdi_status: "stamped",
    updated_at: "2026-10-03T13:00:00Z",
  });
  const before = { ...f.tables.invoices[0] };
  await assert.rejects(
    saveRecoveredInvoice(f.admin, lease, INVOICE_ID, snapshot, {
      kind: "hit",
      facturapi_id: "old-provider",
      uuid: "old-uuid",
    }, "test"),
    (error: unknown) =>
      error instanceof InvoiceRecoveryError &&
      error.kind === "document_changed",
  );
  assert.deepEqual(f.tables.invoices[0], before);
});

Deno.test("queue recovery: no escribe una factura de otra empresa ni una reserva perdida", async () => {
  const f = testDatabase();
  const lease = (await claimQueueLease(
    f.admin,
    { ...f.tables.cfdi_retry_queue[0] } as QueueSnapshot,
    VERSION,
  ))!;
  await assert.rejects(
    saveRecoveredInvoice(
      f.admin,
      lease,
      INVOICE_ID,
      { ...f.tables.invoices[0], organization_id: ORG_B } as RecoveryInvoice,
      { kind: "failed", facturapi_id: "provider" },
      "test",
    ),
  );
  f.tables.cfdi_retry_queue[0].status = "exhausted";
  await assert.rejects(
    saveRecoveredInvoice(
      f.admin,
      lease,
      INVOICE_ID,
      { ...f.tables.invoices[0] } as RecoveryInvoice,
      { kind: "failed", facturapi_id: "provider" },
      "test",
    ),
  );
  assert.equal(f.tables.invoices[0].cfdi_uuid, null);
  assert.equal(
    f.queries.filter((query) => query.table === "invoices" && query.patch)
      .length,
    0,
  );
  assert.equal(lease.organizationId, ORG_A);
});
