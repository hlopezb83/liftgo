import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let resp: SupabaseMockResponse = { data: "batch-1", error: null };
let lastArgs: unknown = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      create_supplier_payment_batch: (args) => {
        lastArgs = args;
        return resp;
      },
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useCreatePaymentBatch } from "../useCreatePaymentBatch";

describe("useCreatePaymentBatch", () => {
  beforeEach(() => {
    resp = { data: "batch-1", error: null };
    lastArgs = null;
  });

  it("happy path: invoca RPC con items y notas", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePaymentBatch(), { wrapper: Wrapper });
    result.current.mutate({
      items: [{ bill_id: "b-1", amount: 1000, reference: "abc" }],
      notes: "lote marzo",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("batch-1");
    expect(lastArgs).toMatchObject({
      p_items: [{ bill_id: "b-1", amount: 1000 }],
      p_notes: "lote marzo",
    });
  });

  it("notes default a null", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePaymentBatch(), { wrapper: Wrapper });
    result.current.mutate({ items: [{ bill_id: "b-1", amount: 500 }] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastArgs).toMatchObject({ p_notes: null });
  });

  it("propaga error del RPC", async () => {
    resp = { data: null, error: { code: "42501", message: "permission denied" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePaymentBatch(), { wrapper: Wrapper });
    result.current.mutate({ items: [{ bill_id: "b-1", amount: 500 }] });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
