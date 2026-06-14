import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const state = {
  assignedInsertError: null as { code?: string; message: string } | null,
  forkliftsSelect: [{ id: "f-1", status: "available" }] as { id: string; status: string }[],
  forkliftsUpdateResult: [{ id: "f-1" }] as { id: string }[] | null,
  statusLogsInsertError: null as { code?: string; message: string } | null,
};

const quoteAssignResolver: ChainResolver = (calls) => {
  if (calls.some((c) => c.method === "insert")) {
    return { data: null, error: state.assignedInsertError };
  }
  return { data: [], error: null };
};
const forkliftsResolver: ChainResolver = (calls) => {
  if (calls.some((c) => c.method === "update")) {
    return { data: state.forkliftsUpdateResult, error: null };
  }
  return { data: state.forkliftsSelect, error: null };
};
const statusLogsResolver: ChainResolver = (calls) => {
  if (calls.some((c) => c.method === "insert")) {
    return { data: null, error: state.statusLogsInsertError };
  }
  return { data: [], error: null };
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      quote_assigned_forklifts: quoteAssignResolver,
      forklifts: forkliftsResolver,
      status_logs: statusLogsResolver,
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn() }));

import { useAssignForklift } from "../useAssignForklift";

describe("useAssignForklift", () => {
  beforeEach(() => {
    state.assignedInsertError = null;
    state.forkliftsSelect = [{ id: "f-1", status: "available" }];
    state.forkliftsUpdateResult = [{ id: "f-1" }];
    state.statusLogsInsertError = null;
  });

  it("happy path: insert + update + status_logs", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("falla si el insert en quote_assigned_forklifts choca (unique)", async () => {
    state.assignedInsertError = { code: "23505", message: "duplicate" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("falla si update no afecta filas (RLS)", async () => {
    state.forkliftsUpdateResult = [];
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAssignForklift(), { wrapper: Wrapper });
    result.current.mutate([{ quoteId: "q-1", forkliftId: "f-1", lineIndex: 0 }]);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/no se modificó/);
  });
});
