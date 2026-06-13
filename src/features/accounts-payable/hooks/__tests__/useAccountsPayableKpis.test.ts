import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useFakeTimeMty } from "@/test/helpers/time";

/**
 * useAccountsPayableKpis — agrega buckets de pendiente/vencido/por vencer y
 * factura USD se convierte a MXN para "por aprobar". Si esto falla, el
 * tablero de CxP miente.
 */

const useSupplierBillsMock = vi.fn();
vi.mock("../useSupplierBills", () => ({
  useSupplierBills: () => useSupplierBillsMock(),
}));

import { useAccountsPayableKpis } from "../useAccountsPayableKpis";

function bill(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    supplier_id: "s-1",
    status: "pending",
    approval_status: "approved",
    issue_date: "2026-06-01",
    due_date: "2026-06-30",
    total: 1_000,
    balance: 1_000,
    currency: "MXN",
    exchange_rate: 1,
    rep_summary: { pending: 0, received: 0, rejected: 0, total: 0, worst: "not_required" },
    suppliers: { id: "s-1", name: "Prov" },
    ...over,
  };
}

beforeEach(() => useFakeTimeMty("2026-06-13T12:00:00"));
afterEach(() => vi.useRealTimers());

describe("useAccountsPayableKpis", () => {
  it("clasifica factura vencida (due_date < hoy)", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ due_date: "2026-05-01", balance: 2_500 })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.totalVencido).toBe(2_500);
    expect(result.current.kpis.totalPorVencer).toBe(0);
    expect(result.current.kpis.totalPendiente).toBe(2_500);
  });

  it("clasifica factura por vencer dentro de 7 días", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ due_date: "2026-06-18", balance: 500 })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.totalPorVencer).toBe(500);
    expect(result.current.kpis.totalVencido).toBe(0);
  });

  it("convierte USD a MXN al sumar 'por aprobar'", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          total: 100,
          currency: "USD",
          exchange_rate: 18.5,
        }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(1_850);
  });

  it("ignora facturas canceladas en todos los buckets", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ status: "cancelled", balance: 9_999, approval_status: "pending" })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.totalPendiente).toBe(0);
    expect(result.current.kpis.countPorAprobar).toBe(0);
  });

  it("suma pagadoMesActual solo cuando issue_date está en el mes en curso", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ status: "paid", issue_date: "2026-06-05", total: 1_000, balance: 0 }),
        bill({ status: "paid", issue_date: "2026-05-30", total: 500, balance: 0 }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.pagadoMesActual).toBe(1_000);
  });
});
