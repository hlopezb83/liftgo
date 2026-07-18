import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";

const h = vi.hoisted(() => {
  const state = {
    assignedInsertError: null as { code?: string; message: string } | null,
    forkliftsSelect: [{ id: "f-1", status: "available" }] as
      { id: string; status: string }[],
    forkliftsUpdateResult: [{ id: "f-1" }] as { id: string }[] | null,
    statusLogsInsertError: null as { code?: string; message: string } | null,
    statusLogsInsertResult: [{ id: "log-1" }] as { id: string }[] | null,
  };
  const quoteAssignResolver = (calls: { method: string; args: unknown[] }[]) => {
    if (calls.some((c) => c.method === "insert")) {
      return { data: null, error: state.assignedInsertError };
    }
    return { data: [], error: null };
  };
  const forkliftsResolver = (calls: { method: string; args: unknown[] }[]) => {
    if (calls.some((c) => c.method === "update")) {
      return { data: state.forkliftsUpdateResult, error: null };
    }
    return { data: state.forkliftsSelect, error: null };
  };
  const statusLogsResolver = (calls: { method: string; args: unknown[] }[]) => {
    if (calls.some((c) => c.method === "insert")) {
      return { data: state.statusLogsInsertResult, error: state.statusLogsInsertError };
    }
    return { data: [], error: null };
  };
  return { state, quoteAssignResolver, forkliftsResolver, statusLogsResolver };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      quote_assigned_forklifts: h.quoteAssignResolver as ChainResolver,
      forklifts: h.forkliftsResolver as ChainResolver,
      status_logs: h.statusLogsResolver as ChainResolver,
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

import { useAssignForklift } from "../useAssignForklift";

describe("useAssignForklift", () => {
  beforeEach(() => {
    h.state.assignedInsertError = null;
    h.state.forkliftsSelect = [{ id: "f-1", status: "available" }];
    h.state.forkliftsUpdateResult = [{ id: "f-1" }];
    h.state.statusLogsInsertError = null;
  });

  it("happy path: insert + update + status_logs", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("falla si el insert en quote_assigned_forklifts choca (unique)", async () => {
    h.state.assignedInsertError = { code: "23505", message: "duplicate" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("falla si update no afecta filas (RLS)", async () => {
    h.state.forkliftsUpdateResult = [];
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/no se modificó/);
  });
});
