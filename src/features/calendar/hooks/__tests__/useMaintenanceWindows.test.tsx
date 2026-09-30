import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMaintenanceWindows } from "../useMaintenanceWindows";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const start = new Date(2026, 8, 1);
const end = new Date(2026, 8, 30);
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe("useMaintenanceWindows", () => {
  beforeEach(() => rpc.mockReset());

  it("queries the visible range and returns every blocker without a client cap", async () => {
    const windows = Array.from({ length: 600 }, (_, index) => ({
      id: `log-${index}`, forklift_id: `forklift-${index}`, date: "2026-09-01",
      label: "OT abierta", is_open: true,
    }));
    rpc.mockResolvedValue({ data: windows, error: null });
    const { result } = renderHook(() => useMaintenanceWindows(start, end), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith("get_calendar_maintenance_windows", {
      _start: "2026-09-01", _end: "2026-09-30", _include_e2e: false,
    });
    expect(result.current.data).toHaveLength(600);
  });

  it("surfaces server errors instead of showing an empty calendar", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
    const { result } = renderHook(() => useMaintenanceWindows(start, end), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
