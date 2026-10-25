import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { callRpc } from "@/lib/rpc";
import { useBookingFormState } from "./useBookingFormState";

vi.mock("@/lib/rpc", () => ({ callRpc: vi.fn().mockResolvedValue([{ id: "selected" }]) }));
vi.mock("@/features/fleet", async () => import("@/features/fleet/hooks/forklifts/useAvailableForklifts"));

describe("booking date availability feedback", () => {
  it("reports an inverted range before submission, preserves selection, and recovers after correction", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useBookingFormState(), { wrapper });
    act(() => {
      result.current.form.setValue("forklift_id", "selected");
      result.current.form.setValue("date_range", { from: new Date(2026, 9, 26), to: new Date(2026, 9, 25) });
    });
    expect(result.current.dateRangeError).toBe("La fecha de fin debe ser posterior a la de inicio");
    expect(result.current.datesSelected).toBe(false);
    expect(result.current.forkliftId).toBe("selected");
    expect(callRpc).not.toHaveBeenCalled();
    act(() => {
      result.current.form.setValue("date_range", { from: new Date(2026, 9, 25), to: new Date(2026, 9, 26) });
    });
    await waitFor(() => expect(result.current.availableForklifts).toEqual([{ id: "selected" }]));
    expect(result.current.dateRangeError).toBeUndefined();
    expect(result.current.forkliftId).toBe("selected");
  });
});
