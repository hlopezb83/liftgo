import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: supabaseMock.rpc },
}));

import { useAccountsPayableBillPage } from "../useAccountsPayableBillPage";
import { useAccountsPayableSummary } from "../useAccountsPayableSummary";
import { useAccountsPayableTableState } from "../useAccountsPayableTableState";

describe("accounts payable server queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests only the active filtered, sorted page", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { items: [{ id: "bill-26", bill_number: "CXP-0026" }], totalCount: 76 },
      error: null,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableBillPage({
      search: "  CXP-0026 ",
      status: "pending",
      supplierId: "supplier-1",
      category: "refacciones",
      month: "2026-09",
      approval: "approved",
      rep: "received",
      pageIndex: 2,
      pageSize: 25,
      sortBy: "supplier",
      sortDesc: false,
    }), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data?.totalCount).toBe(76));
    expect(result.current.data?.items[0]?.id).toBe("bill-26");
    expect(result.current.data?.items[0]).toMatchObject({ payments: [], rep_summary: { total: 0 } });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_supplier_bills_page", {
      p_search: "CXP-0026",
      p_status: "pending",
      p_supplier_id: "supplier-1",
      p_category: "refacciones",
      p_month: "2026-09",
      p_approval: "approved",
      p_rep: "received",
      p_page: 2,
      p_page_size: 25,
      p_sort_by: "supplier",
      p_sort_desc: false,
    });
  });

  it("uses a separate summary query for global KPIs and month options", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: {
        kpis: {
          totalPendiente: 100,
          totalVencido: 20,
          totalPorVencer: 30,
          pagadoMesActual: 40,
          totalPorAprobar: 50,
          countPorAprobar: 2,
          repPendientes: 1,
          fxMissingCount: 3,
        },
        availableMonths: ["2026-09", "2026-08"],
      },
      error: null,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableSummary(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.availableMonths).toEqual(["2026-09", "2026-08"]));
    expect(result.current.kpis).toMatchObject({ totalPendiente: 100, fxMissingCount: 3 });
    expect(supabaseMock.rpc).toHaveBeenCalledWith("get_accounts_payable_summary");
  });

  it("resets the remote page when filters change and keeps one server sort", () => {
    const { result, rerender } = renderHook(
      ({ filterKey }: { filterKey: string }) => useAccountsPayableTableState(filterKey),
      { initialProps: { filterKey: "status=all" } },
    );

    act(() => result.current.onPaginationChange({ pageIndex: 3, pageSize: 25 }));
    expect(result.current.pagination.pageIndex).toBe(3);

    rerender({ filterKey: "status=pending" });
    expect(result.current.pagination.pageIndex).toBe(0);

    act(() => result.current.onSortingChange([
      { id: "total", desc: true },
      { id: "status", desc: false },
    ]));
    expect(result.current.sorting).toEqual([{ id: "total", desc: true }]);
    expect(result.current.pagination.pageIndex).toBe(0);
  });
});
