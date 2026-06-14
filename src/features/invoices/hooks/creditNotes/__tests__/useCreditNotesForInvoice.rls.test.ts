import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { credit_notes: () => resp },
  }),
}));

import { useCreditNotesForInvoice } from "../useCreditNotesQueries";

describe("useCreditNotesForInvoice — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table credit_notes" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreditNotesForInvoice("inv-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("devuelve filas cuando hay acceso", async () => {
    resp = {
      data: [{ id: "cn-1", invoice_id: "inv-1", total: 500 }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreditNotesForInvoice("inv-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ id: "cn-1" });
  });

  it("disabled cuando invoiceId es undefined", () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreditNotesForInvoice(undefined), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
