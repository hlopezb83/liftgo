import { strict as assert } from "node:assert";
import {
  assertFiscalRetryContext,
  fiscalConfigFingerprint,
  FiscalRetryContextError,
  getRetryAwareFacturapiConfig,
} from "./retryContext.ts";
import {
  INVOICE_ID,
  ORG_A,
  ORG_B,
  QUEUE_ID,
  testDatabase,
  VERSION,
} from "../../process-cfdi-retry-queue/testDatabase.ts";
const config = {
  mode: "test" as const,
  apiKey: "sk_test_synthetic_fixture_only",
};
function fixture() {
  const db = testDatabase();
  db.tables.cfdi_retry_queue[0].status = "processing";
  const input = {
    admin: db.admin,
    body: { retry_queue: { id: QUEUE_ID, token: VERSION } },
    isServiceRole: true,
    documentId: INVOICE_ID,
    organizationId: ORG_A,
    operation: "stamp",
    env: () => undefined,
  };
  return { db, input };
}
Deno.test("retry context: huella compatible con SHA-256 de PostgreSQL y separada por ambiente", async () => {
  assert.equal(
    await fiscalConfigFingerprint(config.mode, config.apiKey),
    "cb77d1a4288d32cfafee5bbfa0ec0cef8b09aacc05daf1f7e0d9135bb05743ac",
  );
  assert.notEqual(
    await fiscalConfigFingerprint("live", config.apiKey),
    await fiscalConfigFingerprint("test", config.apiKey),
  );
});
Deno.test("retry context: configuración original exacta pasa sin adoptar datos del payload", async () => {
  const { input } = fixture();
  await assertFiscalRetryContext(input, config);
});
Deno.test("retry context: llamada del navegador con reserva es rechazada antes de secretos", async () => {
  const { input, db } = fixture();
  await assert.rejects(
    getRetryAwareFacturapiConfig({ ...input, isServiceRole: false }),
    (e: unknown) =>
      e instanceof FiscalRetryContextError && e.kind === "forbidden",
  );
  assert.equal(db.queries.length, 0);
});
Deno.test("retry context: consulta normal no tiene acceso a tablas privadas de Plataforma", async () => {
  const { input, db } = fixture();
  await getRetryAwareFacturapiConfig({
    ...input,
    body: {},
    isServiceRole: false,
  });
  assert.equal(
    db.queries.some((q) =>
      q.table === "platform_fiscal_jobs" || q.table === "cfdi_retry_queue"
    ),
    false,
  );
});
Deno.test("retry context: rechaza rotación, otro ambiente, snapshot observado y empresa ajena", async () => {
  for (
    const patch of [
      { key_fingerprint: "different" },
      { mode_at_enqueue: "live" },
      { config_source: "observed" },
      { organization_id: ORG_B },
      { document_id: QUEUE_ID },
      { operation: "cancel" },
      { removed: true },
    ]
  ) {
    const { input, db } = fixture();
    Object.assign(db.tables.platform_fiscal_jobs[0], patch);
    await assert.rejects(
      assertFiscalRetryContext(input, config),
      (e: unknown) =>
        e instanceof FiscalRetryContextError && e.kind === "changed",
    );
  }
});
Deno.test("retry context: el token antiguo y una BD no disponible no se aceptan", async () => {
  const { input, db } = fixture();
  db.tables.cfdi_retry_queue[0].updated_at = "2026-10-03T12:00:00Z";
  await assert.rejects(
    assertFiscalRetryContext(input, config),
    (e: unknown) =>
      e instanceof FiscalRetryContextError && e.kind === "changed",
  );
  db.tables.cfdi_retry_queue[0].updated_at = VERSION;
  db.failQuery((q) => q.table === "platform_fiscal_jobs");
  await assert.rejects(
    assertFiscalRetryContext(input, config),
    (e: unknown) =>
      e instanceof FiscalRetryContextError && e.kind === "unavailable",
  );
});
