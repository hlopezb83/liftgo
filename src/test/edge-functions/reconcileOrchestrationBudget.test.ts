import { describe, expect, it } from "vitest";
import { ORGANIZATION_A, ORGANIZATION_B, type QueryRecord } from "./ncPdfRecoveryFixture";
import {
  advance, fixture, laneId, LANE_ORDER, laneRow, laneStatus, laneTable,
  mocks, reconcile, type Lane,
} from "./reconcileOrchestrationHarness";

function isFinalWrite(query: QueryRecord, lane: Lane) {
  if (!query.filters.some((filter) => filter.column === "id" && filter.value === laneId(lane))) return false;
  if (lane === "rep") return query.patch?.rep_cfdi_status === "stamped";
  if (lane === "nc") return query.patch?.cfdi_status === "stamped";
  if (lane === "pdf") return query.patch?.cfdi_pdf_url != null;
  return false;
}

describe("Reconciler single wall-clock budget (real handler, offline)", () => {
  it.each([50_000, 50_001])("starts its 50s budget before authentication, strict > boundary (%sms)", async (elapsed) => {
    const { reads, writes } = fixture();
    mocks.auth.mockImplementation(async () => {
      advance(elapsed);
      return { ok: true };
    });
    const result = await reconcile();
    expect(reads.slice(0, 5)).toHaveLength(5);
    expect(result.truncated).toBe(elapsed > 50_000);
    if (elapsed > 50_000) {
      expect(result).toEqual({ processed: 0, truncated: true, results: [], organizations: [] });
      expect(writes).toEqual([]);
      expect(mocks.config).not.toHaveBeenCalled();
    } else {
      expect(result.results.map((row) => row.status)).toEqual(LANE_ORDER.map((lane) => laneStatus[lane]));
    }
  });

  it("charges tenant resolution and selections to the same budget", async () => {
    const { behavior, reads, writes } = fixture();
    behavior.readError = () => {
      advance(8_000);
      return false;
    };
    const result = await reconcile({ "x-caller-user-id": "manual-user" });
    expect(reads).toHaveLength(7); // membership, active tenant, then five queues
    expect(result).toEqual({ processed: 0, truncated: true, results: [], organizations: [] });
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("checks again before the first row if configuration exhausts the budget", async () => {
    const { writes } = fixture();
    mocks.config.mockImplementation(async () => {
      advance(50_001);
      return { apiKey: "offline", mode: "test" };
    });
    expect(await reconcile()).toEqual({
      processed: 0, truncated: true, results: [],
      organizations: [{ organization_id: ORGANIZATION_A, status: "ok" }],
    });
    expect(writes).toEqual([]);
    expect(mocks.xml).not.toHaveBeenCalled();
    expect(mocks.folio).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it.each(LANE_ORDER)("checks budget between %s rows and before every later lane", async (lane) => {
    const { tables, behavior, rpc } = fixture();
    const secondId = lane === "pdf" ? "55555555-5555-4555-8555-555555555555" : `${lane}-second`;
    const second = laneRow(lane, { id: secondId });
    tables[laneTable(lane)].push(second);
    const before = { ...second };
    if (lane === "fac") rpc.mockImplementation(async () => {
      advance(50_001);
      return { data: null, error: null };
    });
    else if (lane === "folio") mocks.folio.mockImplementation(async () => {
      advance(50_001);
      return { ok: true };
    });
    else behavior.beforeWrite = (query) => {
      if (isFinalWrite(query, lane)) advance(50_001);
    };
    const result = await reconcile();
    const expected = LANE_ORDER.slice(0, LANE_ORDER.indexOf(lane) + 1);
    expect(result.results.map((row) => row.invoice_id)).toEqual(expected.map(laneId));
    expect(result.results.map((row) => row.status)).toEqual(expected.map((item) => laneStatus[item]));
    expect(result.truncated).toBe(true);
    expect(second).toEqual(before);
    for (const later of LANE_ORDER.slice(LANE_ORDER.indexOf(lane) + 1)) {
      const row = tables[laneTable(later)].find((row) => row.id === laneId(later));
      expect(row).toEqual(laneRow(later));
    }
  });

  it.each(LANE_ORDER.slice(0, -1))("does not reset the budget at the lane after %s", async (lane) => {
    const { behavior, rpc } = fixture();
    if (lane === "fac") rpc.mockImplementation(async () => {
      advance(50_001);
      return { data: null, error: null };
    });
    else if (lane === "folio") mocks.folio.mockImplementation(async () => {
      advance(50_001);
      return { ok: true };
    });
    else behavior.beforeWrite = (query) => {
      if (isFinalWrite(query, lane)) advance(50_001);
    };
    const result = await reconcile();
    expect(result.results.map((row) => row.invoice_id)).toEqual(
      LANE_ORDER.slice(0, LANE_ORDER.indexOf(lane) + 1).map(laneId),
    );
    expect(result.truncated).toBe(true);
  });

  it("accumulates time across FAC, REP, folio and NC instead of granting each 50s", async () => {
    const { behavior, rpc } = fixture();
    rpc.mockImplementation(async () => {
      advance(15_000);
      return { data: null, error: null };
    });
    mocks.folio.mockImplementation(async () => {
      advance(15_000);
      return { ok: true };
    });
    behavior.beforeWrite = (query) => {
      if (isFinalWrite(query, "rep") || isFinalWrite(query, "nc")) advance(15_000);
    };
    const result = await reconcile();
    expect(result.results.map((row) => row.status)).toEqual([
      "reconciled", "rep_reconciled", "rep_folio_recovered", "nc_reconciled",
    ]);
    expect(result.truncated).toBe(true);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalledWith("pac-pdf");
  });

  it("does not start another organization after an earlier organization's last row exhausts time", async () => {
    const { tables, rpc } = fixture(["fac"]);
    const later = laneRow("fac", { id: "fac-other", organization_id: ORGANIZATION_B });
    tables.invoices.push(later);
    const before = { ...later };
    rpc.mockImplementation(async () => {
      advance(50_001);
      return { data: null, error: null };
    });
    const result = await reconcile();
    expect(result.results.map((row) => row.invoice_id)).toEqual(["fac-1"]);
    expect(result.truncated).toBe(true);
    expect(result.organizations).toEqual([{ organization_id: ORGANIZATION_A, status: "ok" }]);
    expect(mocks.config).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ organizationId: ORGANIZATION_A }));
    expect(later).toEqual(before);
  });

  it("passes the original budget into PDF-only recovery after earlier lanes", async () => {
    const { rpc } = fixture(["fac", "pdf"]);
    rpc.mockImplementation(async () => {
      advance(45_000);
      return { data: null, error: null };
    });
    mocks.retrieve.mockImplementation(async (id: string) => {
      advance(6_000);
      return { id, uuid: laneRow("pdf").cfdi_uuid, type: "E", status: "valid", livemode: false };
    });
    const result = await reconcile();
    expect(result.results.map((row) => row.status)).toEqual(["reconciled", "nc_pdf_deferred"]);
    expect(mocks.pdf).not.toHaveBeenCalledWith("pac-pdf");
    // Existing contract: an inner PDF deferral is not itself the outer flag.
    expect(result.truncated).toBe(false);
  });
});
