import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { deliveryQueries } from "../useDeliveries";

const state = vi.hoisted(() => ({ calls: [] as ChainCall[], error: null as null | { message: string } }));
const delivery = { id: "delivery-1", booking_id: "booking-1", type: "delivery", status: "completed",
  signature_base64: "data:image/png;base64,fixture", hours_reading: 125,
  completed_at: "2026-11-01T18:00:00Z", driver_name: "Operador QA", driver_phone: "0000000000",
  address: "Dirección QA", forklifts: { name: "Equipo QA", model: "Modelo QA" }, historical_reconciliation: null };
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: { deliveries: calls => {
    state.calls = calls;
    const single = calls.some(call => call.method === "single");
    const { signature_base64: _signature, ...listRow } = delivery;
    return { data: single ? delivery : [listRow], error: state.error };
  } } }),
}));

beforeEach(() => { state.calls = []; state.error = null; });

describe("delivery read projections", () => {
  it.each([undefined, "booking-1"])("omits signatures from list %s and preserves operational fields", async bookingId => {
    const { queryClient } = createQueryWrapper();
    const rows = await queryClient.fetchQuery(deliveryQueries.list({ bookingId: bookingId ?? null }));
    const select = String(state.calls.find(call => call.method === "select")?.args[0]);
    const rootColumns = select.split(", forklifts(")[0].split(", ");
    expect(rootColumns).not.toContain("*");
    expect(rootColumns).not.toContain("signature_base64");
    expect(rootColumns).toEqual(expect.arrayContaining([
      "id", "booking_id", "forklift_id", "type", "status", "scheduled_date", "scheduled_time",
      "completed_at", "hours_reading", "created_at", "driver_name", "driver_phone", "address",
      "transport_cost", "charged_to_customer", "completed_no_evidence_reason", "notes",
    ]));
    expect(select).toContain("forklifts(name, model)");
    expect(select).toContain("historical_reconciliation:delivery_historical_reconciliations(*)");
    expect(state.calls).toContainEqual({ method: "limit", args: [501] });
    expect(state.calls.filter(call => call.method === "eq")).toEqual(bookingId ? [{ method: "eq", args: ["booking_id", bookingId] }] : []);
    expect(rows[0]).not.toHaveProperty("signature_base64");
    expect(rows[0]).toMatchObject({ hours_reading: 125, completed_at: delivery.completed_at, forklifts: delivery.forklifts });
  });

  it("keeps the signature in the exact-ID detail query", async () => {
    const row = await createQueryWrapper().queryClient.fetchQuery(deliveryQueries.detail(delivery.id));
    expect(state.calls).toContainEqual({ method: "eq", args: ["id", delivery.id] });
    expect(state.calls).toContainEqual({ method: "single", args: [] });
    expect(String(state.calls.find(call => call.method === "select")?.args[0])).toMatch(/^\*,/);
    expect(row.signature_base64).toBe(delivery.signature_base64);
  });

  it("propagates a list failure instead of confirming an empty list", async () => {
    state.error = { message: "Lectura no disponible" };
    await expect(createQueryWrapper().queryClient.fetchQuery(deliveryQueries.list())).rejects.toEqual(state.error);
  });
});
