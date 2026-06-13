import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => resp }),
}));

import { useInvoices } from "../useInvoices";

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

  it("devuelve lista vacia cuando RLS oculta todas las filas (data:[] sin error)", async () => {
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
