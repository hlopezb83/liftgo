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

describe("useAccountsPayableKpis", () => {
  useFakeTimeMty("2026-06-13T12:00:00");

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

  it("B-10 · suma pagadoMesActual por payment_date de los pagos del mes, no por issue_date", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        // Factura emitida en mayo pero pagada en junio → cuenta en junio.
        bill({
          status: "paid",
          issue_date: "2026-05-30",
          total: 1_000,
          balance: 0,
          payments: [{ payment_date: "2026-06-05", amount: 1_000 }],
        }),
        // Factura emitida en junio pero pagada en mayo → NO cuenta en junio.
        bill({
          status: "paid",
          issue_date: "2026-06-02",
          total: 500,
          balance: 0,
          payments: [{ payment_date: "2026-05-30", amount: 500 }],
        }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.pagadoMesActual).toBe(1_000);
  });

  it("R7 Bloque 6 · normaliza balance USD a MXN en totalPendiente/Vencido", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ due_date: "2026-05-01", balance: 800, total: 800, currency: "USD", exchange_rate: 20 }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.totalVencido).toBe(16_000);
    expect(result.current.kpis.totalPendiente).toBe(16_000);
  });

  it("BL-R8-02 · excluye borradores de Vencido/Por vencer/Pendiente aunque tengan balance y due_date vencido", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ status: "draft", due_date: "2026-05-01", balance: 142_000 })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.totalVencido).toBe(0);
    expect(result.current.kpis.totalPorVencer).toBe(0);
    expect(result.current.kpis.totalPendiente).toBe(0);
  });

  it("BL-R8-02 · un borrador pendiente de aprobación sí cuenta en Por aprobar", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ status: "draft", approval_status: "pending", balance: 500, total: 500 })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(1);
    expect(result.current.kpis.totalPorAprobar).toBe(500);
  });

  it("BL-R8-03 · una factura pagada con approval_status huérfano en 'pending' no cuenta como Por aprobar", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ status: "paid", approval_status: "pending", balance: 0, total: 1_000, issue_date: "2026-06-01" })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.countPorAprobar).toBe(0);
    expect(result.current.kpis.totalPorAprobar).toBe(0);
  });
});

describe("useAccountsPayableKpis · G-B4/G-B6 tipo de cambio faltante", () => {
  useFakeTimeMty("2026-06-13T12:00:00");

  it("excluye de los totales la factura en divisa sin tipo de cambio y la cuenta", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ due_date: "2026-05-01", balance: 500, total: 500, currency: "USD", exchange_rate: null }),
        bill({ due_date: "2026-05-01", balance: 1_000, total: 1_000 }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.fxMissingCount).toBe(1);
    expect(result.current.kpis.totalPendiente).toBe(1_000);
    expect(result.current.kpis.totalVencido).toBe(1_000);
  });

  it("no cuenta como faltante una factura MXN sin tipo de cambio", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ currency: "MXN", exchange_rate: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.fxMissingCount).toBe(0);
  });

  // R8-11: el conteo FX del KPI debe usar el mismo universo elegible que el aging.
  it("no cuenta como faltante de TC un borrador en divisa", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ status: "draft", currency: "USD", exchange_rate: null, balance: 900, total: 900 }),
        bill({ currency: "USD", exchange_rate: null, balance: 500, total: 500 }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.fxMissingCount).toBe(1);
  });

  it("no cuenta como faltante de TC una factura en divisa ya saldada", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ currency: "USD", exchange_rate: null, balance: 0, total: 500 })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableKpis(), { wrapper: Wrapper });
    expect(result.current.kpis.fxMissingCount).toBe(0);
  });
});

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
