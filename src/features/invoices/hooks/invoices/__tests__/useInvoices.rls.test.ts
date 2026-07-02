import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let resp: SupabaseMockResponse = { data: [], error: null };

// tableResolvers explícito (no fromResolver genérico) para que cualquier
// query a otra tabla falle visiblemente en vez de heredar la respuesta de
// `invoices` por error.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { invoices: () => resp },
  }),
}));

import { useInvoice, useInvoices } from "../useInvoices";

describe("useInvoices — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied del backend", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table invoices" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoices(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "42501" });
  });

  it("devuelve lista vacía cuando RLS oculta todas las filas", async () => {
    resp = { data: [], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoices(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("entrega filas cuando staff tiene acceso", async () => {
    resp = {
      data: [{ id: "inv-1", invoice_number: "FAC-0001", total: 1000 }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoices(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ id: "inv-1" });
  });
});
