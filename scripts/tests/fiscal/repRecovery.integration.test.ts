import path from "node:path";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostgresAdapter } from "./postgresAdapter";

const boundary = vi.hoisted(() => ({
  admin: null as unknown,
  lookup: vi.fn(), xml: vi.fn(), pdf: vi.fn(), create: vi.fn(), folio: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/supabaseClients.ts", () => ({ getAdminClient: () => boundary.admin }));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({ authenticateCronRequest: async () => ({ ok: true }) }));
vi.mock("../../../supabase/functions/_shared/cors.ts", () => ({ handleCors: () => null }));
vi.mock("../../../supabase/functions/_shared/http.ts", () => ({ jsonResponse: (_: Request, body: unknown, init: ResponseInit) => new Response(JSON.stringify(body), init) }));
vi.mock("../../../supabase/functions/_shared/facturapi/invoiceRecovery.ts", () => ({ lookupPacInvoice: boundary.lookup }));
vi.mock("../../../supabase/functions/_shared/repFolio.ts", () => ({ assignRepFolio: boundary.folio, repFolioPendingMessage: String }));
vi.mock("../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  getFacturapiConfigForOrganization: async () => ({ apiKey: "synthetic-no-network", mode: "test" }),
  createFacturapiClient: () => ({ invoices: { create: boundary.create, downloadXml: boundary.xml, downloadPdf: boundary.pdf } }),
  binaryToText: async (value: unknown) => value,
  binaryToBytes: async (value: unknown) => value,
  retryOnFacturapi5xx: (fn: () => unknown) => fn(),
  describeFacturapiError: (error: Error) => ({ message: error.message }),
}));
const handlerPath = "../../../supabase/functions/reconcile-stamping-invoices/index.ts";
const { handleRequest } = await import(handlerPath);
const PAYMENT = "11900000-0000-4000-8000-000000000001";
const ORGANIZATION = "11900000-0000-4000-8000-000000000002";
const INVOICE = "11900000-0000-4000-8000-000000000003";
const UUID = "11900000-0000-4000-8000-000000000004";
const STALE = "2026-01-01T00:00:00.000Z";
const port = Number(process.env.FISCAL_TEST_PORT);
if (process.env.RUN_LOCAL_FISCAL_TESTS !== "1" || !process.env.FISCAL_TEST_CLUSTER || !Number.isSafeInteger(port) || port < 1) {
  throw new Error("Run through scripts/tests/fiscal/run-rep-postgres.mjs, never against an existing database.");
}
const sql = postgres({ host: "127.0.0.1", port, database: "postgres", username: "postgres", password: "", max: 4,
  connect_timeout: 5, connection: { statement_timeout: 10_000 }, onnotice: () => {} });
let adapter: ReturnType<typeof createPostgresAdapter>;
const read = async () => (await sql`SELECT * FROM payments WHERE id=${PAYMENT}`)[0];
const stale = async () => { await sql`UPDATE payments SET rep_stamping_started_at=${STALE} WHERE id=${PAYMENT}`; };
async function run() {
  const response = await handleRequest(new Request("http://localhost/fixture-reconcile", { method: "POST" }));
  expect(response.status).toBe(200);
  return (await response.json()).results as Array<{ status: string }>;
}
const hit = () => ({ kind: "hit", facturapi_id: "synthetic-pac-rep-1", uuid: UUID });

beforeAll(async () => {
  const [{ data_directory: dataDirectory }] = await sql`SHOW data_directory`;
  expect(dataDirectory).toBe(path.join(process.env.FISCAL_TEST_CLUSTER!, "data"));
  expect(await sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`).toHaveLength(0);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No HTTP/provider/network transport is permitted by this fixture"); }));
  await sql.unsafe(`
    CREATE TABLE payments (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, invoice_id uuid NOT NULL,
      rep_cfdi_status text NOT NULL, rep_cfdi_uuid uuid, rep_facturapi_id text,
      rep_stamping_started_at timestamptz, rep_lookup_attempts integer NOT NULL DEFAULT 0,
      rep_stamping_attempts integer NOT NULL DEFAULT 0, rep_number text, rep_folio integer,
      rep_error_message text, rep_xml_url text, rep_pdf_url text, rep_xml_pending boolean DEFAULT false
    );
    CREATE TABLE invoices (id uuid, organization_id uuid, cfdi_status text, cfdi_uuid uuid,
      facturapi_invoice_id text, serie text, folio text, updated_at timestamptz, stamping_attempts integer);
    CREATE TABLE credit_notes (id uuid, organization_id uuid, cfdi_status text, cfdi_uuid uuid,
      facturapi_invoice_id text, updated_at timestamptz, lookup_attempts integer, stamping_attempts integer);
    CREATE TABLE fixture_fault (mode text NOT NULL);
    INSERT INTO fixture_fault VALUES ('none');
    CREATE FUNCTION fixture_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE mode text; BEGIN
      SELECT f.mode INTO mode FROM fixture_fault f;
      IF (mode='identifiers' AND NEW.rep_facturapi_id IS DISTINCT FROM OLD.rep_facturapi_id)
        OR (mode='finalization' AND NEW.rep_cfdi_status='stamped')
        OR (mode='state' AND NEW.rep_cfdi_status IS DISTINCT FROM OLD.rep_cfdi_status)
        OR (mode='counter' AND NEW.rep_lookup_attempts IS DISTINCT FROM OLD.rep_lookup_attempts)
      THEN RAISE EXCEPTION 'Synthetic PostgreSQL persistence rejection' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fixture_reject_write BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION fixture_reject_write();
  `);
});
afterAll(async () => { vi.unstubAllGlobals(); await sql.end({ timeout: 1 }); });
afterEach(() => {
  expect(boundary.create).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
beforeEach(async () => {
  vi.clearAllMocks();
  await sql`UPDATE fixture_fault SET mode='none'`;
  await sql`TRUNCATE payments`;
  await sql`INSERT INTO payments (id,organization_id,invoice_id,rep_cfdi_status,rep_stamping_started_at,rep_number,rep_folio)
    VALUES (${PAYMENT},${ORGANIZATION},${INVOICE},'stamping',${STALE},'CP-FIXTURE-0001',1)`;
  adapter = createPostgresAdapter(sql);
  boundary.admin = adapter.admin;
  boundary.lookup.mockResolvedValue(hit());
  boundary.xml.mockResolvedValue("<synthetic-rep />");
  boundary.pdf.mockResolvedValue(new Uint8Array([1, 2]));
  boundary.create.mockImplementation(() => { throw new Error("Reconciliation must never issue another REP"); });
});

describe("actual REP reconciler with PostgreSQL persistence and synthetic PAC", () => {
  it("recovers after uncertain lookup, persists one identity and repeat becomes a no-op", async () => {
    boundary.lookup.mockResolvedValueOnce({ kind: "lookup_failed" });
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_lookup_deferred" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamping", rep_lookup_attempts: 0, rep_facturapi_id: null });
    await stale();
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_reconciled" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamped", rep_facturapi_id: "synthetic-pac-rep-1", rep_cfdi_uuid: UUID, rep_stamping_started_at: null });
    expect(await run()).toEqual([]);
    expect(await sql`SELECT id FROM payments`).toHaveLength(1);
    expect(boundary.lookup).toHaveBeenCalledTimes(2);
    expect(boundary.xml).toHaveBeenCalledTimes(1);
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("preserves a microsecond-precision PostgreSQL claim across the JSON transport", async () => {
    await sql`UPDATE payments SET rep_stamping_started_at='2026-01-01T00:00:00.123456Z' WHERE id=${PAYMENT}`;
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_reconciled" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamped", rep_cfdi_uuid: UUID });
    expect(boundary.lookup).toHaveBeenCalledTimes(1);
  });

  it.each(["pending", "failed"])("persists PAC %s without false finalization", async (kind) => {
    boundary.lookup.mockResolvedValue({ kind, facturapi_id: "synthetic-pac-rep-1" });
    const expected = kind === "pending" ? "rep_pac_pending" : "rep_pac_failed_manual_review";
    expect(await run()).toEqual([expect.objectContaining({ status: expected })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: kind === "pending" ? "stamping" : "error", rep_facturapi_id: "synthetic-pac-rep-1" });
    expect(boundary.xml).not.toHaveBeenCalled();
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("consumes only persisted misses and enables retry only after five confirmed misses", async () => {
    boundary.lookup.mockResolvedValue({ kind: "miss" });
    await sql`UPDATE fixture_fault SET mode='counter'`;
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_persistence_error" })]);
    expect((await read()).rep_lookup_attempts).toBe(0);
    await sql`UPDATE fixture_fault SET mode='none'`;
    for (let count = 1; count <= 5; count++) {
      await stale();
      expect(await run()).toEqual([expect.objectContaining({ status: count < 5 ? "rep_lookup_deferred" : "rep_reverted_to_error" })]);
      expect(await read()).toMatchObject({ rep_lookup_attempts: count, rep_cfdi_status: count < 5 ? "stamping" : "error" });
    }
    expect((await read()).rep_stamping_started_at).toBeNull();
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it.each(["identifiers", "finalization"])("recovers after PostgreSQL rejects %s, retaining the same payment and PAC identity", async (mode) => {
    await sql`UPDATE fixture_fault SET mode=${mode}`;
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_persistence_error" })]);
    expect((await read()).rep_cfdi_status).toBe("stamping");
    expect((await read()).rep_stamping_started_at).not.toBeNull();
    await sql`UPDATE fixture_fault SET mode='none'`;
    await stale();
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_reconciled" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamped", rep_facturapi_id: "synthetic-pac-rep-1", rep_cfdi_uuid: UUID });
    expect(await sql`SELECT id FROM payments`).toHaveLength(1);
    expect(boundary.lookup).toHaveBeenCalledTimes(mode === "finalization" ? 1 : 2);
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("does not report a manual-review transition when PostgreSQL rejects its state update", async () => {
    boundary.lookup.mockResolvedValue({ kind: "failed", facturapi_id: "synthetic-pac-rep-1" });
    await sql`UPDATE fixture_fault SET mode='state'`;
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_persistence_error" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamping", rep_facturapi_id: null });
  });

  it("two real concurrent UPDATE claims admit only one handler and one recovery", async () => {
    let snapshots = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => { release = resolve; });
    adapter.hooks.afterPaymentSnapshot = async () => { if (++snapshots === 2) release(); await bothRead; };
    const results = (await Promise.all([run(), run()])).flat().map((result) => result.status).sort();
    expect(snapshots).toBe(2);
    expect(results).toEqual(["claimed_by_other_run", "rep_reconciled"]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamped", rep_cfdi_uuid: UUID });
    expect(boundary.lookup).toHaveBeenCalledTimes(1);
    expect(boundary.xml).toHaveBeenCalledTimes(1);
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("a SQL claim replacement during lookup is not overwritten by the stale handler", async () => {
    boundary.lookup.mockImplementation(async () => {
      await sql`UPDATE payments SET rep_stamping_started_at='2099-01-01T00:00:00Z' WHERE id=${PAYMENT}`;
      return hit();
    });
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_persistence_error" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "stamping", rep_facturapi_id: null });
    expect((await read()).rep_stamping_started_at.toISOString()).toBe("2099-01-01T00:00:00.000Z");
    expect(boundary.xml).not.toHaveBeenCalled();
  });

  it("a terminal SQL state change during document download cannot be overwritten", async () => {
    boundary.xml.mockImplementation(async () => {
      await sql`UPDATE payments SET rep_cfdi_status='cancelled' WHERE id=${PAYMENT}`;
      return "<synthetic-rep />";
    });
    expect(await run()).toEqual([expect.objectContaining({ status: "rep_persistence_error" })]);
    expect(await read()).toMatchObject({ rep_cfdi_status: "cancelled", rep_facturapi_id: "synthetic-pac-rep-1", rep_cfdi_uuid: UUID });
    expect(boundary.create).not.toHaveBeenCalled();
  });
});
