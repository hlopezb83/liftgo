import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { DateRange } from "react-day-picker";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callRpc } from "@/lib/rpc";
import { useAvailableForklifts } from "../useAvailableForklifts";

vi.mock("@/lib/rpc", () => ({ callRpc: vi.fn() }));

function setup(range: DateRange | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ dateRange }) => useAvailableForklifts(dateRange), {
    initialProps: { dateRange: range }, wrapper,
  });
}

describe("useAvailableForklifts date boundary", () => {
  beforeEach(() => { vi.mocked(callRpc).mockReset().mockResolvedValue([{ id: "forklift-1" }]); });

  it.each([
    ["missing", undefined],
    ["incomplete", { from: new Date(2026, 9, 25) }],
    ["inverted", { from: new Date(2026, 9, 26), to: new Date(2026, 9, 25) }],
    ["invalid start", { from: new Date(NaN), to: new Date(2026, 9, 25) }],
    ["invalid end", { from: new Date(2026, 9, 25), to: new Date(NaN) }],
  ] satisfies [string, DateRange | undefined][])("blocks %s dates, including manual refetch", async (_, range) => {
    const { result } = setup(range);
    expect(result.current.datesSelected).toBe(false);
    expect(callRpc).not.toHaveBeenCalled();
    await act(async () => { await result.current.refetch(); });
    expect(callRpc).not.toHaveBeenCalled();
    expect(result.current.availableForklifts).toEqual([]);
    expect(result.current.isSuccess).toBe(false);
  });

  it("accepts the same local calendar day regardless of time order", async () => {
    const { result } = setup({ from: new Date(2026, 9, 25, 23), to: new Date(2026, 9, 25, 1) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callRpc).toHaveBeenCalledWith("get_available_forklifts", {
      p_start_date: "2026-10-25", p_end_date: "2026-10-25",
    });
    expect(result.current.dateRangeError).toBeUndefined();
    expect(result.current.availableForklifts).toEqual([{ id: "forklift-1" }]);
  });

  it("clears the local error and resumes querying when dates are corrected", async () => {
    const { result, rerender } = setup({ from: new Date(2026, 9, 26), to: new Date(2026, 9, 25) });
    expect(result.current.dateRangeError).toBe("La fecha de fin debe ser posterior a la de inicio");
    rerender({ dateRange: { from: new Date(2026, 9, 25), to: new Date(2026, 9, 26) } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.dateRangeError).toBeUndefined();
    expect(callRpc).toHaveBeenCalledTimes(1);
    rerender({ dateRange: { from: new Date(NaN), to: new Date(2026, 9, 26) } });
    expect(result.current.availableForklifts).toEqual([]);
    expect(result.current.dateRangeError).toBe("Selecciona fechas válidas");
    await act(async () => { await result.current.refetch(); });
    expect(callRpc).toHaveBeenCalledTimes(1);
  });
});
