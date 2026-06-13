import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useFakeTimeMty } from "@/test/helpers/time";

const useSupplierBillsMock = vi.fn();
vi.mock("../useSupplierBills", () => ({
  useSupplierBills: () => useSupplierBillsMock(),
}));

import { useAgingReport } from "../useAgingReport";

function bill(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    supplier_id: "s-1",
    status: "pending",
    issue_date: "2026-01-01",
    due_date: "2026-06-13",
    balance: 1_000,
    suppliers: { id: "s-1", name: "Prov" },
    ...over,
  };
}

describe("useAgingReport", () => {
  useFakeTimeMty("2026-06-13T12:00:00");

  it("clasifica buckets por días vencidos (current, 1-30, 31-60, 61-90, 90+)", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ supplier_id: "a", due_date: "2026-07-01", balance: 100, suppliers: { id: "a", name: "A" } }), // current (futuro)
        bill({ supplier_id: "b", due_date: "2026-06-01", balance: 200, suppliers: { id: "b", name: "B" } }), // 12 días = 1-30
        bill({ supplier_id: "c", due_date: "2026-05-01", balance: 300, suppliers: { id: "c", name: "C" } }), // 43 días = 31-60
        bill({ supplier_id: "d", due_date: "2026-04-01", balance: 400, suppliers: { id: "d", name: "D" } }), // 73 días = 61-90
        bill({ supplier_id: "e", due_date: "2026-01-01", balance: 500, suppliers: { id: "e", name: "E" } }), // >90
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAgingReport(), { wrapper: Wrapper });

    expect(result.current.totals.current).toBe(100);
    expect(result.current.totals.d1_30).toBe(200);
    expect(result.current.totals.d31_60).toBe(300);
    expect(result.current.totals.d61_90).toBe(400);
    expect(result.current.totals.d90_plus).toBe(500);
    expect(result.current.totals.total).toBe(1_500);
  });

  it("agrega múltiples facturas del mismo proveedor en una sola fila", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ supplier_id: "s-1", due_date: "2026-06-01", balance: 200 }),
        bill({ supplier_id: "s-1", due_date: "2026-04-01", balance: 400 }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAgingReport(), { wrapper: Wrapper });
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].total).toBe(600);
    expect(result.current.rows[0].d1_30).toBe(200);
    expect(result.current.rows[0].d61_90).toBe(400);
  });

  it("excluye facturas canceladas o con balance ≤ 0", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ status: "cancelled", balance: 9_999 }),
        bill({ balance: 0 }),
        bill({ supplier_id: "x", balance: 50, suppliers: { id: "x", name: "X" } }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAgingReport(), { wrapper: Wrapper });
    expect(result.current.totals.total).toBe(50);
    expect(result.current.rows).toHaveLength(1);
  });

  it("ordena filas descendente por total", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [
        bill({ supplier_id: "a", balance: 100, suppliers: { id: "a", name: "A" } }),
        bill({ supplier_id: "b", balance: 500, suppliers: { id: "b", name: "B" } }),
        bill({ supplier_id: "c", balance: 300, suppliers: { id: "c", name: "C" } }),
      ],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAgingReport(), { wrapper: Wrapper });
    expect(result.current.rows.map((r) => r.supplierId)).toEqual(["b", "c", "a"]);
  });

  it("usa 'sin-proveedor' cuando supplier_id es null", () => {
    useSupplierBillsMock.mockReturnValue({
      data: [bill({ supplier_id: null, suppliers: null, balance: 75 })],
      isLoading: false,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAgingReport(), { wrapper: Wrapper });
    expect(result.current.rows[0].supplierId).toBe("sin-proveedor");
    expect(result.current.rows[0].supplierName).toBe("Sin proveedor");
  });
});
