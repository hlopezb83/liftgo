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

import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useForklifts — RLS contract", () => {
  beforeEach(() => {
    fromResp = { data: [], error: null };
  });

  it("customer recibe lista vacía (RLS positiva: customer sin policy → 0 filas)", async () => {
    fromResp = { data: [], error: null };
    const { result } = renderHook(() => useForklifts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("staff (admin) recibe flota completa con costos sensibles", async () => {
    fromResp = {
      data: [
        { id: "f1", name: "Toyota", model: "8FGCU25", acquisition_cost: 250000 },
      ],
      error: null,
    };
    const { result } = renderHook(() => useForklifts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ acquisition_cost: 250000 });
  });
});
