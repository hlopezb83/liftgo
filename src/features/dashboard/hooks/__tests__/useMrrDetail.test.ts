import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

/**
 * useMrrDetail — source of truth para el KPI MRR del dashboard.
 * Riesgo: si redondea mal o no normaliza la respuesta vacía, el KPI principal
 * del tablero ejecutivo se rompe.
 */

const callRpcMock = vi.fn();
vi.mock("@/lib/rpc", () => ({
  callRpc: (...args: unknown[]) => callRpcMock(...args),
}));

import { useMrrDetail } from "../useMrrDetail";

beforeEach(() => {
  callRpcMock.mockReset();
});

describe("useMrrDetail", () => {
  it("invoca el RPC get_mrr_detail y redondea total_mrr a 2 decimales", async () => {
    callRpcMock.mockResolvedValueOnce({
      items: [
        {
          forklift_id: "fk-1",
          forklift_name: "FK-001",
          model: "H25",
          manufacturer: "Hyster",
          serial_number: "SN1",
          monthly_rate: 12_345.678,
          daily_rate: 500,
          weekly_rate: 3_000,
          customer_name: "ACME",
          customer_id: "c-1",
          booking_number: "RSV-0001",
          start_date: "2026-06-01",
          end_date: "2026-06-30",
        },
      ],
      total_mrr: 12_345.678,
    });

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMrrDetail(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callRpcMock).toHaveBeenCalledWith("get_mrr_detail");
    expect(result.current.data?.total_mrr).toBe(12_345.68);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it("normaliza respuesta nula/vacía a items=[] y total_mrr=0", async () => {
    callRpcMock.mockResolvedValueOnce(null);

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMrrDetail(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ items: [], total_mrr: 0 });
  });

  it("propaga errores del RPC", async () => {
    callRpcMock.mockRejectedValueOnce(new Error("permission denied"));

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useMrrDetail(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
