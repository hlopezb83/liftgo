import { describe, expect, it } from "vitest";
import { ORGANIZATION_A, ORGANIZATION_B, type Row } from "./ncPdfRecoveryFixture";
import {
  CUTOFF, DOC_UUID, fixture, handleRequest, laneId, LANE_ORDER, laneRow,
  laneStatus, laneTable, mocks, reconcile, request, STALE_AT,
} from "./reconcileOrchestrationHarness";

const ids = (result: Awaited<ReturnType<typeof reconcile>>) => result.results.map((row) => row.invoice_id);

describe("Reconciler orchestration characterization (real handler, offline)", () => {
  it.each(["http://localhost:5173", "https://untrusted.example"])(
    "returns real CORS preflight before admin/auth/selection: %s", async (origin) => {
      const { reads, writes } = fixture();
      const response = await handleRequest(request({ origin }, undefined, "OPTIONS"));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
      expect(response.headers.get("access-control-allow-origin")).toBe(origin.includes("localhost") ? origin : "");
      expect(response.headers.get("vary")).toBe("Origin");
      expect(mocks.getAdmin).not.toHaveBeenCalled();
      expect(mocks.auth).not.toHaveBeenCalled();
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
      expect(mocks.config).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403])("preserves auth status/body and CORS without work (%s)", async (status) => {
    const { reads, writes, rpc, upload } = fixture();
    mocks.auth.mockResolvedValue({ ok: false, status, error: "Rejected credentials" });
    const response = await handleRequest(request({ origin: "http://localhost:5173" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Rejected credentials" });
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("keeps the exact empty response, after all five bounded selections", async () => {
    const { reads, writes } = fixture([]);
    expect(await reconcile()).toEqual({ processed: 0, results: [] });
    expect(reads.map((read) => read.table)).toEqual(["invoices", "payments", "payments", "credit_notes", "credit_notes"]);
    expect(reads.map((read) => read.limit)).toEqual([10, 10, 10, 10, 10]);
    for (const index of [0, 1, 3, 4]) {
      expect(reads[index].filters).toContainEqual({
        operator: "lt", column: index === 1 ? "rep_stamping_started_at" : "updated_at", value: CUTOFF,
      });
    }
    // Already-stamped REP folio repair has intentionally no age cutoff.
    expect(reads[2].filters).toEqual([
      { operator: "eq", column: "rep_cfdi_status", value: "stamped" },
      { operator: "is", column: "rep_number", value: null },
      { operator: "not", column: "rep_facturapi_id", negatedOperator: "is", value: null },
    ]);
    expect(reads[4].order).toEqual([{ column: "updated_at", ascending: true }, { column: "id", ascending: true }]);
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("selects every queue before I/O and runs FAC → REP stamping → REP folio → NC stamping → NC PDF", async () => {
    const { reads, rpc } = fixture();
    mocks.config.mockImplementation(async () => {
      expect(reads).toHaveLength(5);
      expect(mocks.xml).not.toHaveBeenCalled();
      return { apiKey: "offline", mode: "test" };
    });
    const result = await reconcile();
    expect(result).toEqual({
      processed: 5, truncated: false,
      results: LANE_ORDER.map((lane) => ({
        invoice_id: laneId(lane), status: laneStatus[lane],
        ...(lane === "folio" ? { organization_id: ORGANIZATION_A } : {}),
      })),
      organizations: [{ organization_id: ORGANIZATION_A, status: "ok" }],
    });
    expect(mocks.events).toEqual([
      "xml:pac-fac", "pdf:pac-fac", "rpc:reconcile_stamping_invoice:fac-1",
      "xml:pac-rep", "pdf:pac-rep", "folio:folio-1", "xml:pac-nc", "pdf:pac-nc",
      "retrieve:pac-pdf", "pdf:pac-pdf",
    ]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("reconcile_stamping_invoice", expect.objectContaining({
      p_invoice_id: "fac-1", p_facturapi_env: "test", p_cfdi_xml: "<xml />",
      p_xml_storage_path: `${ORGANIZATION_A}/fac-1/${DOC_UUID}.xml`,
    }));
  });

  it.each(LANE_ORDER)("does not exit early when only %s has pending work", async (lane) => {
    const { reads } = fixture([lane]);
    const result = await reconcile();
    expect(ids(result)).toEqual([laneId(lane)]);
    expect(result.results[0].status).toBe(laneStatus[lane]);
    expect(reads.slice(0, 5)).toHaveLength(5);
  });

  it("FAC only saves recovered IDs until the next cycle, but the next FAC and REP/NC continue", async () => {
    const { tables, writes, rpc } = fixture();
    const invoice = tables.invoices[0];
    Object.assign(invoice, { cfdi_uuid: null, facturapi_invoice_id: null });
    tables.invoices.push(laneRow("fac", { id: "fac-2", facturapi_invoice_id: "pac-fac-2" }));
    for (const lane of ["rep", "nc"] as const) {
      const row = tables[laneTable(lane)].find((row) => row.id === laneId(lane))!;
      Object.assign(row, lane === "rep"
        ? { rep_cfdi_uuid: null, rep_facturapi_id: null }
        : { cfdi_uuid: null, facturapi_invoice_id: null });
    }
    mocks.lookup.mockImplementation(async (_client: unknown, id: string) => ({
      kind: "hit", facturapi_id: `recovered-${id}`, uuid: DOC_UUID,
    }));
    const result = await reconcile();
    expect(ids(result)).toEqual(["fac-1", "fac-2", "rep-1", "folio-1", "nc-1", laneId("pdf")]);
    expect(result.results.map((row) => row.status)).toEqual([
      "recovered_from_pac", "reconciled", "rep_reconciled", "rep_folio_recovered", "nc_reconciled", "nc_pdf_recovered",
    ]);
    expect(invoice).toMatchObject({ facturapi_invoice_id: "recovered-fac-1", cfdi_uuid: DOC_UUID, cfdi_status: "stamping" });
    expect(writes.filter((write) => write.table === "invoices" && write.filters.some((filter) => filter.value === "fac-1"))
      .map((write) => write.patch)).toEqual([
      { updated_at: expect.any(String) }, { facturapi_invoice_id: "recovered-fac-1", cfdi_uuid: DOC_UUID },
    ]);
    expect(mocks.xml.mock.calls.map(([id]) => id)).toEqual(["pac-fac-2", "recovered-rep-1", "recovered-nc-1"]);
    expect(mocks.pdf).not.toHaveBeenCalledWith("recovered-fac-1");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("reconcile_stamping_invoice", expect.objectContaining({ p_invoice_id: "fac-2" }));
  });

  it.each([
    ["pending", 0, "pac_pending", "stamping", 0],
    ["failed", 0, "pac_failed_manual_review", "error", 0],
    ["lookup_failed", 9, "pac_lookup_deferred", "stamping", 9],
    ["miss", 0, "pac_lookup_deferred", "stamping", 1],
    ["miss", 9, "reverted_to_error", "error", 10],
  ] as const)("FAC %s (attempts=%s) does not fall through or exit later lanes", async (kind, attempts, status, state, count) => {
    const { tables, rpc } = fixture(["fac", "rep", "nc"]);
    const invoice = tables.invoices[0];
    Object.assign(invoice, { cfdi_uuid: null, facturapi_invoice_id: null, stamping_attempts: attempts });
    mocks.lookup.mockResolvedValue({ kind, facturapi_id: "pac-pending" });
    const result = await reconcile();
    expect(result.results.map((row) => row.status)).toEqual([status, "rep_reconciled", "nc_reconciled"]);
    expect(invoice).toMatchObject({ cfdi_status: state, stamping_attempts: count });
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.xml.mock.calls.map(([id]) => id)).toEqual(["pac-rep", "pac-nc"]);
  });

  it("scopes all five queues to server-resolved tenant, ignoring browser body organization", async () => {
    const { tables, reads } = fixture();
    const foreign: Row[] = [];
    for (const lane of LANE_ORDER) {
      const row = laneRow(lane, { id: lane === "pdf" ? "55555555-5555-4555-8555-555555555555" : `${lane}-foreign`, organization_id: ORGANIZATION_B });
      tables[laneTable(lane)].push(row);
      foreign.push(row);
    }
    const before = structuredClone(foreign);
    const result = await reconcile({ "x-caller-user-id": "manual-user" }, { organization_id: ORGANIZATION_B });
    expect(ids(result)).toEqual(LANE_ORDER.map(laneId));
    expect(foreign).toEqual(before);
    const selections = reads.filter((read) => LANE_ORDER.some((lane) => laneTable(lane) === read.table));
    expect(selections).toHaveLength(5);
    for (const selection of selections) expect(selection.filters).toContainEqual({
      operator: "eq", column: "organization_id", value: ORGANIZATION_A,
    });
    expect(mocks.config).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ organizationId: ORGANIZATION_A }));
  });

  it.each([
    ["missing", 403], ["ambiguous", 409], ["inactive", 403], ["lookup-error", 503],
  ] as const)("fails closed for manual tenant %s before the five queues", async (kind, status) => {
    const { tables, reads, writes, behavior } = fixture();
    if (kind === "missing") tables.organization_memberships = [];
    if (kind === "ambiguous") tables.organization_memberships.push({ ...tables.organization_memberships[0] });
    if (kind === "inactive") tables.organizations[0].is_active = false;
    if (kind === "lookup-error") behavior.readError = (query) => query.table === "organization_memberships";
    const response = await handleRequest(request({ "x-caller-user-id": "manual-user" }));
    expect(response.status).toBe(status);
    expect(reads.every((read) => ["organization_memberships", "organizations"].includes(read.table))).toBe(true);
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it.each(["missing", "throws"])("reports all five misconfigured lanes and still processes a configured tenant (%s)", async (kind) => {
    const { tables, writes } = fixture();
    const badBefore = structuredClone(tables);
    tables.invoices.push(laneRow("fac", { id: "fac-other", organization_id: ORGANIZATION_B }));
    mocks.config.mockImplementation(async ({ organizationId }: { organizationId: string }) => {
      if (organizationId === ORGANIZATION_B) return { apiKey: "offline-other", mode: "test" };
      if (kind === "throws") throw new Error("Unavailable");
      return { apiKey: null, mode: "test" };
    });
    const result = await reconcile();
    expect(result.results.slice(0, 5).map((row) => [row.invoice_id, row.status])).toEqual(
      ["fac", "rep", "nc", "pdf", "folio"].map((lane) => [laneId(lane as typeof LANE_ORDER[number]), "org_misconfigured"]),
    );
    expect(result.results[5]).toMatchObject({ invoice_id: "fac-other", status: "reconciled" });
    expect(result.organizations?.map((org) => [org.organization_id, org.status])).toEqual([
      [ORGANIZATION_A, "misconfigured"], [ORGANIZATION_B, "ok"],
    ]);
    expect(mocks.createClient).toHaveBeenCalledExactlyOnceWith("offline-other");
    expect(writes.every((write) => write.filters.some((filter) => filter.column === "id" && filter.value === "fac-other"))).toBe(true);
    for (const table of ["payments", "credit_notes"]) expect(tables[table]).toEqual(badBefore[table]);
    expect(tables.invoices[0]).toEqual(badBefore.invoices[0]);
  });

  it("reports all orphan lanes in their existing diagnostic order without credentials or writes", async () => {
    const { tables, writes, upload, rpc } = fixture();
    for (const table of ["invoices", "payments", "credit_notes"]) for (const row of tables[table]) row.organization_id = null;
    const result = await reconcile();
    expect(ids(result)).toEqual(["fac-1", "rep-1", "nc-1", "folio-1", laneId("pdf")]);
    expect(result.results.every((row) => row.status === "skipped_without_organization")).toBe(true);
    expect(result).toMatchObject({ processed: 5, truncated: false, organizations: [] });
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns FAC selection error immediately, without selecting or processing later queues", async () => {
    const { behavior, reads, writes } = fixture();
    behavior.readError = (query) => query.table === "invoices";
    const response = await handleRequest(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Fetch failed" });
    expect(reads.map((read) => read.table)).toEqual(["invoices"]);
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it.each(["rep", "folio", "nc", "pdf"] as const)("keeps independent lanes running after %s selection fails", async (failedLane) => {
    const { behavior } = fixture();
    behavior.readError = (query) => query.table === laneTable(failedLane) && query.filters.some((filter) =>
      filter.column === (failedLane === "rep" || failedLane === "folio" ? "rep_cfdi_status" : "cfdi_status") &&
      filter.value === (failedLane === "rep" || failedLane === "nc" ? "stamping" : "stamped"));
    const result = await reconcile();
    expect(result.results.map((row) => row.status)).toEqual([
      ...(failedLane === "pdf" ? ["nc_pdf_selection_error"] : []),
      ...LANE_ORDER.filter((lane) => lane !== failedLane).map((lane) => laneStatus[lane]),
    ]);
  });

  it.each(LANE_ORDER)("enforces a real ten-row selection limit for %s", async (lane) => {
    const { tables } = fixture([]);
    const rows = Array.from({ length: 12 }, (_, index) => laneRow(lane, {
      id: lane === "pdf" ? `33333333-3333-4333-8333-${String(index).padStart(12, "0")}` : `${lane}-${index}`,
    }));
    tables[laneTable(lane)].push(...rows);
    const result = await reconcile();
    expect(result.processed).toBe(10);
    expect(ids(result)).toEqual(rows.slice(0, 10).map((row) => row.id));
  });

  it.each(["fac", "rep", "nc", "pdf"] as const)("excludes exact-cutoff and newer %s rows", async (lane) => {
    const { tables } = fixture([]);
    const timestamp = lane === "rep" ? "rep_stamping_started_at" : "updated_at";
    const rows = [CUTOFF, "2026-11-08T11:59:00.000Z", STALE_AT].map((time, index) => laneRow(lane, {
      id: lane === "pdf" ? `33333333-3333-4333-8333-${String(index).padStart(12, "0")}` : `${lane}-${index}`,
      [timestamp]: time,
    }));
    tables[laneTable(lane)].push(...rows);
    const result = await reconcile();
    expect(ids(result)).toEqual([rows[2].id]);
  });
});
