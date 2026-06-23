import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type FunctionsInvokeResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const h = vi.hoisted(() => {
  const state = {
    resp: { data: null, error: null } as FunctionsInvokeResponse,
  };
  const toastMock = {
    success: { fn: (..._a: unknown[]) => {}, calls: 0 },
    error: { fn: (..._a: unknown[]) => {}, calls: 0 },
    info: { fn: (..._a: unknown[]) => {}, calls: 0 },
    warning: { fn: (..._a: unknown[]) => {}, calls: 0 },
  };
  return { state, toastMock };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    functionsResolvers: { "refresh-cancellation-status": () => h.state.resp },
  }),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => {
      h.toastMock.success.calls++;
      h.toastMock.success.fn(...a);
    },
    error: (...a: unknown[]) => {
      h.toastMock.error.calls++;
      h.toastMock.error.fn(...a);
    },
    info: (...a: unknown[]) => {
      h.toastMock.info.calls++;
      h.toastMock.info.fn(...a);
    },
    warning: (...a: unknown[]) => {
      h.toastMock.warning.calls++;
      h.toastMock.warning.fn(...a);
    },
  },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: (...a: unknown[]) => {
    h.toastMock.success.calls++;
    h.toastMock.success.fn(...a);
  },
  notifyInfo: (...a: unknown[]) => {
    h.toastMock.info.calls++;
    h.toastMock.info.fn(...a);
  },
  notifyWarning: (...a: unknown[]) => {
    h.toastMock.warning.calls++;
    h.toastMock.warning.fn(...a);
  },
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useRefreshCancellationStatus } from "../useRefreshCancellationStatus";

describe("useRefreshCancellationStatus", () => {
  beforeEach(() => {
    h.state.resp = { data: null, error: null };
    h.toastMock.success.calls = 0;
    h.toastMock.error.calls = 0;
    h.toastMock.warning.calls = 0;
    h.toastMock.info.calls = 0;
  });

  it("SAT accepted -> notifySuccess", async () => {
    h.state.resp = { data: { cancellation_status: "accepted" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRefreshCancellationStatus(), { wrapper: Wrapper });
    result.current.mutate("inv-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.toastMock.success.calls).toBeGreaterThan(0);
  });

  it("SAT rejected -> notifyWarning (era toast.error, ahora se trata como estado de negocio)", async () => {
    h.state.resp = { data: { cancellation_status: "rejected" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRefreshCancellationStatus(), { wrapper: Wrapper });
    result.current.mutate("inv-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.toastMock.warning.calls).toBeGreaterThan(0);
  });

  it("SAT expired -> notifyWarning", async () => {
    h.state.resp = { data: { cancellation_status: "expired" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRefreshCancellationStatus(), { wrapper: Wrapper });
    result.current.mutate("inv-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(h.toastMock.warning.calls).toBeGreaterThan(0);
  });
});
