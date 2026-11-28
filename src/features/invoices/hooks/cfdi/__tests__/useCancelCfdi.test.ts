import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type FunctionsInvokeResponse,
} from "@/test/helpers/supabaseChain";

let cancelResp: FunctionsInvokeResponse = { data: null, error: null };
let lastBody: unknown = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    functionsResolvers: {
      "cancel-cfdi": (body) => {
        lastBody = body;
        return cancelResp;
      },
    },
  }),
}));
const notifyWarningMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifyWarning: (...args: unknown[]) => notifyWarningMock(...args),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useCancelCfdi } from "../useCancelCfdi";

describe("useCancelCfdi", () => {
  beforeEach(() => {
    cancelResp = { data: null, error: null };
    lastBody = null;
    notifyWarningMock.mockClear();
  });

  it("envía motivo y substitution_uuid; éxito con accepted=true", async () => {
    cancelResp = { data: { accepted: true, cancellation_status: "accepted" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelCfdi(), { wrapper: Wrapper });
    result.current.mutate({ invoiceId: "inv-1", motive: "01", substitutionUuid: "sub-uuid" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastBody).toMatchObject({
      invoice_id: "inv-1",
      motive: "01",
      substitution_uuid: "sub-uuid",
    });
  });

  it("dispara notifyWarning cuando el SAT marca pending", async () => {
    cancelResp = {
      data: { accepted: false, cancellation_status: "pending", warning: "esperando 72h" },
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelCfdi(), { wrapper: Wrapper });
    result.current.mutate({ invoiceId: "inv-1", motive: "02" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarningMock).toHaveBeenCalled();
  });

  it("propaga data.error", async () => {
    cancelResp = { data: { error: "Only stamped invoices can be cancelled" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCancelCfdi(), { wrapper: Wrapper });
    result.current.mutate({ invoiceId: "inv-1", motive: "02" });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
