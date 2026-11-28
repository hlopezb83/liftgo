import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

/**
 * R9-P2-03: el detalle de cotización usa `maybeSingle()`. Con `single()`,
 * un refetch en vuelo después de borrar devolvía 0 filas y PostgREST
 * respondía 406 (error crudo + toasts). Ahora "no existe" es `null`.
 */
let resp: SupabaseMockResponse = { data: null, error: null };
let lastCalls: ChainCall[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      quotes: (calls) => {
        lastCalls = calls;
        return resp;
      },
    },
  }),
}));

import { useQuote } from "../useQuotes";

describe("useQuote — detalle tolerante a borrados", () => {
  beforeEach(() => {
    resp = { data: null, error: null };
    lastCalls = [];
  });

  it("devuelve null (sin error) cuando la cotización ya no existe", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuote("q-borrada"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it("usa maybeSingle y no single en la consulta", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuote("q-borrada"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const methods = lastCalls.map((c) => c.method);
    expect(methods).toContain("maybeSingle");
    expect(methods).not.toContain("single");
  });

  it("devuelve la cotización cuando sí existe", async () => {
    resp = { data: { id: "q-1", quote_number: "COT-0001" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuote("q-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ quote_number: "COT-0001" });
  });
});
