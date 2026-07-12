import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let resp: SupabaseMockResponse = { data: [], error: null };

// tableResolvers explícito: si useBookings agrega un .from("forklifts") en una
// segunda query, no caerá al mismo mock y el bug de select equivocado quedará
// expuesto (antes `fromResolver` genérico respondía igual a cualquier tabla).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      bookings: () => resp,
    },
  }),
}));

import { useBookings } from "../useBookings";

describe("useBookings — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied del backend", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table bookings" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBookings(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("entrega filas con join a forklifts cuando hay acceso", async () => {
    resp = {
      data: [
        {
          id: "b-1",
          booking_number: "RSV-0001",
          start_date: "2026-03-01",
          end_date: "2026-03-15",
          forklifts: { name: "F-1", model: "Toyota" },
        },
      ],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBookings(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      booking_number: "RSV-0001",
      forklifts: { name: "F-1" },
    });
  });
});
