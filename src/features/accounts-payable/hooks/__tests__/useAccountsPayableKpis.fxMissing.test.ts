import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
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
    payments: [],
    ...over,
  };
}

describe("useAccountsPayableKpis · R9-11 pending con FX faltante cuenta en Por aprobar", () => {
  useFakeTimeMty("2026-06-13T12:00:00");

  it("una bill pending en USD sin TC cuenta en countPorAprobar sin sumar importe MXN", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          currency: "USD",
          exchange_rate: null,
          total: 100,
          balance: 100,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
    expect(result.current.kpis.fxMissingCount).toBe(1);
  });

  it("una bill pending en USD con TC = 1 (default de formulario) también cuenta pero sin importe MXN", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          currency: "USD",
          exchange_rate: 1,
          total: 100,
          balance: 100,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
  });

  it("una bill pending en USD con TC <= 0 cuenta pero no aporta importe", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          currency: "USD",
          exchange_rate: 0,
          total: 100,
          balance: 100,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
  });

  it("una bill pending en USD con TC válido cuenta y sí suma su importe MXN", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          currency: "USD",
          exchange_rate: 18.5,
          total: 100,
          balance: 100,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(1_850);
    expect(result.current.kpis.fxMissingCount).toBe(0);
  });

  it("una bill 'not_required'/approved en USD sin TC no cuenta en Por aprobar (solo aporta a fxMissingCount)", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "approved",
          currency: "USD",
          exchange_rate: null,
          total: 100,
          balance: 100,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(0);
    expect(result.current.kpis.fxMissingCount).toBe(1);
  });

  it("una bill 'rejected' en USD sin TC no cuenta en Por aprobar ni en ningún bucket", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "rejected",
          currency: "USD",
          exchange_rate: null,
          total: 100,
          balance: 100,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(0);
    expect(result.current.kpis.fxMissingCount).toBe(0);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
  });

  it("una bill pending en USD sin TC pero con saldo cero (pagada/cancelada de facto) sigue contando en Por aprobar (huérfano solo se excluye si status=paid)", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          status: "pending",
          currency: "USD",
          exchange_rate: null,
          total: 100,
          balance: 0,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
    // Saldo cero => fuera del universo elegible de aging, no cuenta como FX faltante avisable.
    expect(result.current.kpis.fxMissingCount).toBe(0);
  });

  it("una bill 'paid' con approval_status huérfano en pending y FX faltante NO cuenta (regla BL-R8-03 se mantiene)", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({
          approval_status: "pending",
          status: "paid",
          currency: "USD",
          exchange_rate: null,
          total: 100,
          balance: 0,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(0);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
  });
});
