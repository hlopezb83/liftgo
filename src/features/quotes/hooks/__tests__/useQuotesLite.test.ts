import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

/**
 * useQuotesLite — query liviana (`id`, `quote_number`) usada por el CRM para
 * construir el mapa folio↔id sin traer las >25 columnas del listado completo.
 */

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { quotes: () => resp },
  }),
}));

import { useQuotesLite } from "../useQuotes";

describe("useQuotesLite", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("devuelve lista vacía cuando no hay cotizaciones", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuotesLite(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("entrega sólo id y quote_number", async () => {
    resp = {
      data: [{ id: "q-1", quote_number: "COT-0001" }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuotesLite(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "q-1", quote_number: "COT-0001" }]);
  });

  it("propaga error del backend", async () => {
    resp = { data: null, error: { message: "permission denied" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuotesLite(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ message: "permission denied" });
  });
});
