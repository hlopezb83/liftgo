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
    tableResolvers: { payments: () => resp },
  }),
}));

import { usePayments } from "../usePayments";

describe("usePayments — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table payments" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => usePayments(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("devuelve filas cuando hay acceso", async () => {
    resp = {
      data: [{ id: "p-1", amount: 1000, invoice_id: "inv-1" }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => usePayments(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ id: "p-1" });
  });
});
