import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useProfitByModelReport } from "../useProfitByModelReport";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

const START = new Date("2026-01-01T00:00:00");
const END = new Date("2026-01-31T00:00:00");

describe("useProfitByModelReport", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("convierte los strings numeric de Postgres a number", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          model: "Toyota 8FGCU25",
          units: "3",
          revenue: "150000.00",
          maintenance: "20000.50",
          damages: "5000.25",
          profit: "124999.25",
          margin: "83.3",
        },
      ],
      error: null,
    });

    const { result } = renderHook(() => useProfitByModelReport(START, END), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const row = result.current.data?.[0];
    expect(row).toBeDefined();
    expect(typeof row?.units).toBe("number");
    expect(typeof row?.revenue).toBe("number");
    expect(row?.units).toBe(3);
    expect(row?.revenue).toBe(150000);
    expect(row?.margin).toBeCloseTo(83.3);
  });

  it("propaga error del RPC como isError", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    const { result } = renderHook(() => useProfitByModelReport(START, END), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith("report_profit_by_model", {
      _start: "2026-01-01",
      _end: "2026-01-31",
    });
  });

  it("pasa fechas en formato YMD (America/Monterrey)", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useProfitByModelReport(START, END), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("report_profit_by_model", {
      _start: "2026-01-01",
      _end: "2026-01-31",
    });
  });
});
