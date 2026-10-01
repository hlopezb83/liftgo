import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXCLUDE_E2E_FILTER, LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";

let response: SupabaseMockResponse = { data: [], error: null };
let calls: ChainCall[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { bookings: (chain) => { calls = chain; return response; } },
  }),
}));
vi.mock("@/lib/format/dateFormats", () => ({ todayKeyMty: () => "2026-09-24" }));

import { useReturnableBookings } from "../useReturnableBookings";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T18:00:00Z"));
  response = { data: [], error: null };
  calls = [];
});
afterEach(() => vi.useRealTimers());

describe("useReturnableBookings", () => {
  it("exige entrega física completada y devolución pendiente antes de limitar", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReturnableBookings({ early: false, enabled: true }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls).toEqual(expect.arrayContaining([
      { method: "select", args: ["*, deliveries!deliveries_booking_id_fkey!inner(id, type, status, completed_at), actual_delivery:deliveries!deliveries_booking_id_fkey(id)"] },
      { method: "eq", args: ["status", "confirmed"] },
      { method: "is", args: ["return_status", null] },
      { method: "eq", args: ["deliveries.type", "delivery"] },
      { method: "eq", args: ["deliveries.status", "completed"] },
      { method: "lte", args: ["actual_delivery.completed_at", "2026-09-24T18:00:00.000Z"] },
      { method: "lte", args: ["end_date", "2026-09-24"] },
      { method: "or", args: [`and(or(${EXCLUDE_E2E_FILTER}),or(start_date.lte.2026-09-24,actual_delivery.not.is.null))`] },
    ]));
    expect(calls.at(-1)).toEqual({ method: "limit", args: [LIST_FETCH_LIMIT] });
  });

  it("permite históricos entregados antes del inicio; busca el ID antes del límite", async () => {
    response = { data: [{ id: "older-booking" }], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useReturnableBookings({ early: true, bookingId: "older-booking", enabled: true }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([{ id: "older-booking" }]));
    expect(calls.some((c) => c.method === "lte" && c.args[0] === "start_date")).toBe(false);
    expect(calls).toContainEqual({ method: "lte", args: ["actual_delivery.completed_at", "2026-09-24T18:00:00.000Z"] });
    expect(calls).toContainEqual({ method: "eq", args: ["deliveries.status", "completed"] });
    expect(calls.some((c) => c.method === "lte" && c.args[0] === "end_date")).toBe(false);
    const idFilter = calls.findIndex((c) => c.method === "eq" && c.args[0] === "id");
    expect(idFilter).toBeGreaterThan(-1);
    expect(idFilter).toBeLessThan(calls.findIndex((c) => c.method === "limit"));
  });

  it("propaga el error de acceso en vez de simular una lista vacía", async () => {
    response = { data: null, error: { code: "42501", message: "permission denied" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReturnableBookings({ early: false, enabled: true }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("no consulta la preparación de devoluciones para un rol de lectura", () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReturnableBookings({ early: false, enabled: false }), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(calls).toEqual([]);
  });
});
