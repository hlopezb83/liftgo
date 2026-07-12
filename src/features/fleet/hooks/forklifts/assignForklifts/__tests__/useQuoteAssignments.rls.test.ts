import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { quote_assigned_forklifts: () => resp },
  }),
}));

import { useQuoteAssignments } from "../useQuoteAssignments";

describe("useQuoteAssignments — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table quote_assigned_forklifts" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuoteAssignments("q-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("devuelve filas asignadas cuando hay acceso", async () => {
    resp = {
      data: [{ id: "a-1", quote_id: "q-1", forklift_id: "f-1", line_index: 0 }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuoteAssignments("q-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ forklift_id: "f-1" });
  });

  it("disabled cuando quoteId es undefined", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useQuoteAssignments(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
