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
import { billPageRow, zeroSummary } from "../../lib/__tests__/accountsPayable.fixture";

describe("accounts payable server queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests only the active filtered, sorted page", async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: { items: Array.from({ length: 25 }, (_, index) => billPageRow(index + 26)), totalCount: 76 },
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
    expect(result.current.data?.items[0]?.id).toBe(billPageRow(26).id);
    expect(result.current.data?.items[0]).not.toHaveProperty("payments");
    expect(result.current.data?.items[0]).not.toHaveProperty("rep_summary");
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

  it("keeps malformed summaries in error instead of presenting zero KPIs", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { kpis: {}, availableMonths: [] }, error: null });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableSummary(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(result.current.kpis).toBeUndefined();
  });

  it("hides old KPIs if a refetch returns an invalid summary, then recovers to legitimate zero", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: zeroSummary(), error: null });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableSummary(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    supabaseMock.rpc.mockResolvedValueOnce({ data: { kpis: {}, availableMonths: [] }, error: null });
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.kpis).toBeUndefined();
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.kpis).toEqual(zeroSummary().kpis);
  });

  it("rejects malformed bill rows rather than returning a successful partial page", async () => {
    supabaseMock.rpc.mockResolvedValue({ data: { items: [{ id: "broken" }], totalCount: 1 }, error: null });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableBillPage({
      search: "", status: "all", supplierId: "all", category: "all", month: "all",
      approval: "all", rep: "all", pageIndex: 0, pageSize: 25, sortBy: "issue_date", sortDesc: true,
    }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("preserves RPC failures as query errors", async () => {
    const error = { message: "Permission denied", code: "42501" };
    supabaseMock.rpc.mockResolvedValue({ data: null, error });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAccountsPayableSummary(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
    expect(result.current.kpis).toBeUndefined();
  });
});
