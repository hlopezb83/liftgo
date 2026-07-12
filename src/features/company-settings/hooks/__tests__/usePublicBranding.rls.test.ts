import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let rpcResp: SupabaseMockResponse = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ rpcResolver: () => rpcResp }),
}));

import { usePublicBranding } from "../usePublicBranding";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("usePublicBranding — RPC pública (sin sesión)", () => {
  beforeEach(() => {
    rpcResp = { data: null, error: null };
  });

  it("devuelve branding usando RPC get_public_branding (no la tabla)", async () => {
    rpcResp = {
      data: [{ logo_url: "https://l.png", razon_social: "LiftGo SA" }],
      error: null,
    };
    const { result } = renderHook(() => usePublicBranding(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      logo_url: "https://l.png",
      razon_social: "LiftGo SA",
    });
  });

  it("devuelve null si la RPC responde vacío", async () => {
    rpcResp = { data: [], error: null };
    const { result } = renderHook(() => usePublicBranding(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("propaga error si la RPC falla", async () => {
    rpcResp = { data: null, error: { message: "rpc error" } };
    const { result } = renderHook(() => usePublicBranding(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
