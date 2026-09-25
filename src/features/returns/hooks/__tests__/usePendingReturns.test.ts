import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXCLUDE_E2E_FILTER } from "@/lib/supabase/constants";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";

let calls: ChainCall[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { bookings: (chain) => { calls = chain; return { data: [], error: null }; } },
  }),
}));
vi.mock("@/lib/format/dateFormats", () => ({ todayKeyMty: () => "2026-09-24" }));

import { usePendingReturns } from "../usePendingReturns";

beforeEach(() => { calls = []; });

describe("usePendingReturns", () => {
  it("excluye reservas sin entrega completada antes de limitar la lista", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => usePendingReturns(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(calls).toEqual(expect.arrayContaining([
      { method: "select", args: ["*, forklifts(name, model), deliveries!deliveries_booking_id_fkey!inner(id)"] },
      { method: "or", args: [EXCLUDE_E2E_FILTER] },
      { method: "eq", args: ["status", "confirmed"] },
      { method: "is", args: ["return_status", null] },
      { method: "eq", args: ["deliveries.type", "delivery"] },
      { method: "eq", args: ["deliveries.status", "completed"] },
      { method: "lte", args: ["start_date", "2026-09-24"] },
      { method: "lt", args: ["end_date", "2026-09-24"] },
    ]));
    expect(calls.at(-1)).toEqual({ method: "limit", args: [2000] });
  });
});
