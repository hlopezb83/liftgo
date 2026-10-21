import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTableChainable, type ChainCall, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";
import type { AvailabilityBooking, AvailabilityUnit } from "../../../lib/availabilityReasons";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/rpc", () => ({ callRpc: mocks.rpc }));
import { fetchAvailabilityReasons } from "../fetchAvailabilityReasons";

const unit: AvailabilityUnit = { id: "f1", name: "Unidad A", model: "Modelo A", status: "available", organization_id: "a" };
const booking: AvailabilityBooking = { id: "b1", forklift_id: "f1", organization_id: "a", status: "confirmed", start_date: "2026-10-01", end_date: "2026-10-05" };
type UnitRow = Omit<AvailabilityUnit, "organization_id"> & { organization_id: string | null };
let units: UnitRow[];
let bookings: AvailabilityBooking[];
let available: UnitRow[];
let calls: Array<{ table: string; chain: ChainCall[] }>;
let tableError: string | undefined;
let predicateError: string | undefined;
let returned: boolean;
let maintenance: boolean;
const params = { organizationId: "a", start: "2026-10-10", end: "2026-10-12", canReadBookings: true };

beforeEach(() => {
  units = [unit]; bookings = []; available = []; calls = []; returned = false; maintenance = false;
  tableError = undefined; predicateError = undefined;
  mocks.from.mockReset().mockImplementation((table: string) => createTableChainable((chain) => {
    calls.push({ table, chain });
    if (tableError === table) return { data: null, error: { message: "not authorized" } };
    const rows = table === "forklifts" ? units : bookings;
    const range = chain.find((call) => call.method === "range")?.args as number[];
    return { data: rows.slice(range[0], range[1] + 1), error: null } satisfies SupabaseMockResponse;
  }));
  mocks.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === predicateError) throw new Error("permission denied");
    if (name === "get_available_forklifts") return available;
    if (name === "today_mty") return "2026-10-10";
    if (name === "forklift_has_maintenance_block") return maintenance;
    if (name === "booking_is_returned") return returned;
    throw new Error(`Unexpected RPC ${name}`);
  });
});

describe("availability evidence read contract", () => {
  it("uses the canonical RPC, scoped narrow reads and no mutations", async () => {
    const result = await fetchAvailabilityReasons(params);
    expect(result.unavailable[0].reason.code).toBe("unknown");
    expect(mocks.rpc).toHaveBeenCalledWith("get_available_forklifts", { p_start_date: params.start, p_end_date: params.end }, { signal: undefined });
    for (const { chain } of calls) {
      expect(chain).toContainEqual({ method: "eq", args: ["organization_id", "a"] });
      expect(chain.some((call) => ["insert", "update", "delete", "upsert"].includes(call.method))).toBe(false);
      const select = chain.find((call) => call.method === "select")!.args[0] as string;
      expect(select).not.toMatch(/\*|customer|cost|rate|notes/);
    }
  });
  it("never exposes another company's row or uses its booking as evidence", async () => {
    units.push({ ...unit, id: "f2", name: "Secret B", organization_id: "b" });
    bookings = [{ ...booking, organization_id: "b", start_date: params.start, end_date: params.end }];
    available = [{ ...unit, organization_id: "b" }];
    const result = await fetchAvailabilityReasons(params);
    expect(result.unavailable).toHaveLength(1);
    expect(result.unavailable[0].reason.code).toBe("unknown");
    expect(JSON.stringify(result)).not.toContain("Secret B");
    expect(mocks.rpc).not.toHaveBeenCalledWith("booking_is_returned", expect.anything(), expect.anything());
  });
  it("discards null-organization fleet rows before displaying or querying their blockers", async () => {
    units.push({ ...unit, id: "unscoped", name: "Legacy without company", organization_id: null });
    const result = await fetchAvailabilityReasons(params);
    expect(result.unavailable.map(({ unit: row }) => row.id)).toEqual(["f1"]);
    expect(result.reservableWhileRented).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("Legacy without company");
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "forklift_has_maintenance_block"))
      .toEqual([["forklift_has_maintenance_block", { p_org: "a", p_forklift: "f1", p_start: params.start, p_end: params.end }, { signal: undefined }]]);
  });
  it("a null-organization RPC row cannot suppress an authorized unavailable unit", async () => {
    available = [{ ...unit, organization_id: null }];
    const result = await fetchAvailabilityReasons(params);
    expect(result.unavailable.map(({ unit: row }) => row.id)).toEqual(["f1"]);
    expect(result.reservableWhileRented).toEqual([]);
  });
  it("does not assert a rented unit is blocked when the canonical RPC permits the dates", async () => {
    units = [{ ...unit, status: "rented" }]; available = units;
    const result = await fetchAvailabilityReasons(params);
    expect(result.unavailable).toEqual([]);
    expect(result.reservableWhileRented).toEqual(units);
    expect(units[0].status).toBe("rented");
  });
  it("verifies an overdue reservation using the existing returned predicate", async () => {
    bookings = [booking];
    const result = await fetchAvailabilityReasons(params);
    expect(result.unavailable[0].reason.code).toBe("return_pending");
    expect(mocks.rpc).toHaveBeenCalledWith("booking_is_returned", { p_booking_id: "b1" }, { signal: undefined });
  });
  it("a returned historical booking does not prove custody", async () => {
    bookings = [booking]; returned = true;
    expect((await fetchAvailabilityReasons(params)).unavailable[0].reason.code).toBe("unknown");
  });
  it("maintenance boolean covers damage without reading protected details", async () => {
    maintenance = true; bookings = [booking];
    expect((await fetchAvailabilityReasons(params)).unavailable[0].reason.code).toBe("maintenance");
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["forklifts", "bookings"]);
  });
  it("does not query reservations without read permission", async () => {
    const result = await fetchAvailabilityReasons({ ...params, canReadBookings: false });
    expect(mocks.from).not.toHaveBeenCalledWith("bookings");
    expect(result.evidenceIncomplete).toBe(true);
    expect(result.unavailable[0].reason.code).toBe("unknown");
  });
  it.each(["bookings", "predicate"])("partial %s failure stays explicit instead of inventing a reason", async (failed) => {
    if (failed === "bookings") tableError = failed;
    else predicateError = "forklift_has_maintenance_block";
    const result = await fetchAvailabilityReasons(params);
    expect(result.evidenceIncomplete).toBe(true);
    expect(result.unavailable[0].reason.code).toBe("unknown");
  });
  it("critical availability failure rejects rather than report no equipment", async () => {
    predicateError = "get_available_forklifts";
    await expect(fetchAvailabilityReasons(params)).rejects.toThrow("permission denied");
  });
  it("a fleet read failure is not interpreted as an empty fleet", async () => {
    tableError = "forklifts";
    await expect(fetchAvailabilityReasons(params)).rejects.toMatchObject({ message: "not authorized" });
  });
  it("limits the existing boolean predicates to four concurrent units", async () => {
    units = Array.from({ length: 10 }, (_, index) => ({ ...unit, id: `f${index}` }));
    let active = 0;
    let maximum = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_available_forklifts") return [];
      if (name === "today_mty") return "2026-10-10";
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return false;
    });
    expect((await fetchAvailabilityReasons(params)).unavailable).toHaveLength(10);
    expect(maximum).toBe(4);
  });
  it("does not downgrade an aborted company-scope request to partial evidence", async () => {
    const controller = new AbortController();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_available_forklifts") return [];
      if (name === "today_mty") return "2026-10-10";
      controller.abort();
      throw new Error("aborted");
    });
    await expect(fetchAvailabilityReasons({ ...params, signal: controller.signal })).rejects.toThrow("aborted");
  });
  it("pages beyond the first 200 units and reservations", async () => {
    units = Array.from({ length: 201 }, (_, i) => ({ ...unit, id: `f${i}`, status: "retired" }));
    bookings = Array.from({ length: 201 }, (_, i) => ({ ...booking, id: `b${i}` }));
    expect((await fetchAvailabilityReasons(params)).unavailable).toHaveLength(201);
    expect(calls.filter((call) => call.table === "forklifts")).toHaveLength(2);
    expect(calls.filter((call) => call.table === "bookings")).toHaveLength(2);
  });
  it("refuses invalid scope and dates before querying", async () => {
    await expect(fetchAvailabilityReasons({ ...params, organizationId: "" })).rejects.toThrow();
    await expect(fetchAvailabilityReasons({ ...params, start: "2026-10-15" })).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
