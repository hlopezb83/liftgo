import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardSections } from "../useDashboardSections";

const state = vi.hoisted(() => ({
  role: "dispatcher" as string | null, canReadInvoices: true,
  financialQuery: vi.fn(), upcomingQuery: vi.fn(), insuranceQuery: vi.fn(),
  upcomingRefetch: vi.fn(),
  upcoming: { data: [{ id: "cached-invoice" }] as { id: string }[] | undefined, isError: false },
}));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: state.role }),
  useHasModuleAccess: () => state.canReadInvoices,
  hasFinancialAccess: (role: string | null | undefined) => !!role && role !== "dispatcher",
}));
vi.mock("@/features/fleet", () => ({
  useInsuranceAlerts: (enabled: boolean) => {
    state.insuranceQuery(enabled);
    return { data: { expiring: [], no_insurance_count: 0 } };
  },
}));
vi.mock("@/features/invoices", () => ({
  useUpcomingInvoices: (enabled: boolean) => {
    state.upcomingQuery(enabled);
    return { ...state.upcoming, refetch: state.upcomingRefetch };
  },
}));
vi.mock("../../useFinancialKpis", () => ({ useFinancialKpis: (enabled: boolean) => { state.financialQuery(enabled); return { data: { mrr: 1000, dso: 10, overdue_total: 200, expiring_contracts: [{ id: "cached-contract" }] }, isError: false, isLoading: false }; } }));
vi.mock("../../useDashboardStats", () => ({ useDashboardStats: () => ({ data: {
  fleet_counts: { total: 10, available: 7, rented: 3, maintenance: 0, retired: 0, sold: 0 },
  pending_deliveries_count: 3,
  invoice_stats: { outstanding_revenue: 1000, breakdown: [{ status: "sent", total: 1000, count: 1 }] },
  overdue_invoices: [{ id: "cached-invoice", due_date: "2026-10-01", total: 1000 }],
  cash_flow: [{ month: "Oct", invoiced: 1000, paid: 500 }],
  utilization: [{ name: "Equipment", revenue: 1000 }],
  monthly_utilization: [{ month_label: "Oct", utilization: 30 }],
  overdue_bookings: [{ booking_id: "operation" }],
} }) }));

beforeEach(() => {
  state.role = "dispatcher";
  state.canReadInvoices = true;
  state.upcoming = { data: [{ id: "cached-invoice" }], isError: false };
  vi.clearAllMocks();
});

describe("Dashboard dispatcher financial data boundary", () => {
  it("disables financial queries and excludes cached finance data while preserving operation", () => {
    const { result } = renderHook(() => useDashboardSections());
    expect(state.financialQuery).toHaveBeenCalledWith(false);
    expect(state.upcomingQuery).toHaveBeenCalledWith(false);
    expect(result.current.canSeeFinancials).toBe(false);
    expect(result.current.priority).toBe("operations");
    expect(result.current.canViewFinancialCharts).toBe(false);
    expect(result.current.cashFlowData).toEqual([]);
    expect(result.current.overdueInvoices).toEqual([]);
    expect(result.current.invoiceBreakdown).toEqual([]);
    expect(result.current.revenuePerUnit).toEqual([]);
    expect(result.current.collectionForecast).toEqual({ status: "hidden" });
    expect(result.current.insuranceAlert.status).toBe("ready");
    expect(result.current.financials.mrr).toBe(0);
    expect(result.current.utilizationPercent).toBe(30);
    expect(result.current.pendingDeliveriesCount).toBe(3);
    expect(result.current.alertsProps.overdueBookings).toEqual([{ booking_id: "operation" }]);
  });
  it("preserves admin data and drops it when the role changes", () => {
    state.role = "admin";
    const { result, rerender } = renderHook(() => useDashboardSections());
    expect(state.financialQuery).toHaveBeenCalledWith(true);
    expect(result.current.cashFlowData).toHaveLength(1);
    expect(result.current.financials.mrr).toBe(1000);
    expect(result.current.priority).toBe("finance");
    state.role = "dispatcher";
    rerender();
    expect(result.current.cashFlowData).toEqual([]);
    expect(result.current.financials.mrr).toBe(0);
    expect(result.current.priority).toBe("operations");
  });
  it("fails closed while role identity is unresolved", () => {
    state.role = null;
    const { result } = renderHook(() => useDashboardSections());
    expect(result.current.canViewFinancialCharts).toBe(false);
    expect(result.current.priority).toBe("overview");
    expect(result.current.cashFlowData).toEqual([]);
    expect(state.financialQuery).toHaveBeenCalledWith(false);
  });
  it("respeta la revocación de lectura de facturas sin retirar KPIs ni seguros", () => {
    state.role = "admin";
    const { result, rerender } = renderHook(() => useDashboardSections());
    expect(result.current.collectionForecast.status).toBe("ready");
    state.canReadInvoices = false;
    rerender();
    expect(state.upcomingQuery).toHaveBeenLastCalledWith(false);
    expect(result.current.collectionForecast).toEqual({ status: "hidden" });
    expect(result.current.priority).toBe("overview");
    expect(result.current.overdueInvoices).toEqual([]);
    expect(result.current.financials.mrr).toBe(1000);
    expect(result.current.insuranceAlert.status).toBe("ready");
  });
  it("no presenta la previsión pendiente o con datos fallidos como un resultado válido", () => {
    state.role = "admin";
    state.upcoming = { data: undefined, isError: false };
    const { result, rerender } = renderHook(() => useDashboardSections());
    expect(result.current.collectionForecast).toEqual({ status: "loading" });
    state.upcoming = { data: [{ id: "stale" }], isError: true };
    rerender();
    const forecast = result.current.collectionForecast;
    expect(forecast.status).toBe("error");
    expect(forecast).not.toHaveProperty("data");
    if (forecast.status === "error") forecast.onRetry();
    expect(state.upcomingRefetch).toHaveBeenCalledOnce();
  });
});
