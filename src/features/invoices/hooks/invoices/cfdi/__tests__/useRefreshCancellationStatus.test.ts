import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type FunctionsInvokeResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let resp: FunctionsInvokeResponse = { data: null, error: null };
const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    functionsResolvers: { "refresh-cancellation-status": () => resp },
  }),
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn() }));

import { useRefreshCancellationStatus } from "../useRefreshCancellationStatus";

describe("useRefreshCancellationStatus", () => {
  beforeEach(() => {
    resp = { data: null, error: null };
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    toastMock.warning.mockClear();
    toastMock.info.mockClear();
  });

  it("SAT accepted -> toast.success", async () => {
    resp = { data: { cancellation_status: "accepted" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRefreshCancellationStatus(), { wrapper: Wrapper });
    result.current.mutate("inv-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("SAT rejected -> toast.error", async () => {
    resp = { data: { cancellation_status: "rejected" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRefreshCancellationStatus(), { wrapper: Wrapper });
    result.current.mutate("inv-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMock.error).toHaveBeenCalled();
  });

  it("SAT expired -> toast.warning", async () => {
    resp = { data: { cancellation_status: "expired" }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useRefreshCancellationStatus(), { wrapper: Wrapper });
    result.current.mutate("inv-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMock.warning).toHaveBeenCalled();
  });
});
