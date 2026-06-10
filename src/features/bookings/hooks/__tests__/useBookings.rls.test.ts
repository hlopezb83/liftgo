import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let fromResp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => fromResp }),
}));

import { useBookings } from "@/features/bookings/hooks/useBookings";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useBookings — RLS contract", () => {
  beforeEach(() => {
    fromResp = { data: [], error: null };
  });

  it("mecánico sin policy SELECT recibe lista vacía", async () => {
    fromResp = { data: [], error: null };
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("customer recibe únicamente sus reservas (RLS filtra por customer_id)", async () => {
    fromResp = {
      data: [
        { id: "b1", booking_number: "RSV-0001", customer_id: "cust-1" },
      ],
      error: null,
    };
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.every((b) => b.customer_id === "cust-1")).toBe(true);
  });

  it("propaga error si la BD responde permission denied", async () => {
    fromResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table bookings" },
    };
    const { result } = renderHook(() => useBookings(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
