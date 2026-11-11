import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useEntityMutation } from "../useEntityMutation";

vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
vi.mock("@/lib/observability/captureOperationalError", () => ({ captureOperationalError: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe("mutation completion while readers refresh", () => {
  it.each(["await", "background"] as const)("preserves the %s completion contract", async (mode) => {
    let finishRefresh: ((value: number) => void) | undefined;
    const refreshed = new Promise<number>((resolve) => { finishRefresh = resolve; });
    const read = vi.fn().mockResolvedValueOnce(1).mockImplementation(() => refreshed);
    const saved = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => {
      const record = useQuery({ queryKey: ["record"], queryFn: read });
      const mutation = useEntityMutation({
        mutationFn: async () => ({ id: "saved" }),
        invalidateKeys: [["record"]],
        ...(mode === "background" ? { invalidationMode: "background" as const } : {}),
        errorTitle: "Save failed",
        onSuccess: saved,
      });
      return { record, mutation };
    }, { wrapper });
    await waitFor(() => expect(result.current.record.isSuccess).toBe(true));
    act(() => result.current.mutation.mutate(undefined));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    if (mode === "background") {
      await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
      expect(result.current.record.isFetching).toBe(true);
    } else {
      expect(saved).not.toHaveBeenCalled();
      expect(result.current.mutation.isPending).toBe(true);
    }
    await act(async () => { finishRefresh?.(2); await refreshed; });
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.record.data).toBe(2));
    unmount();
    client.clear();
  });
});
