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

import { useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useInvoices — RLS contract", () => {
  beforeEach(() => {
    fromResp = { data: [], error: null };
  });

  it("mecánico no tiene policy SELECT → recibe lista vacía sin loop infinito", async () => {
    fromResp = { data: [], error: null };
    const { result } = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("admin recibe facturas", async () => {
    fromResp = {
      data: [{ id: "i1", invoice_number: "FAC-0001", total: 1160 }],
      error: null,
    };
    const { result } = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("propaga error si el backend devuelve permission denied explícito", async () => {
    fromResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table invoices" },
    };
    const { result } = renderHook(() => useInvoices(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
