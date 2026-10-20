import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDashboardSections } from "../useDashboardSections";

const state = vi.hoisted(() => ({ role: "dispatcher" as string | null, financialQuery: vi.fn(), upcomingQuery: vi.fn() }));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: state.role }), useHasFinancialAccess: () => !!state.role && state.role !== "dispatcher" }));
vi.mock("@/features/deliveries", () => ({ useDeliveries: () => ({ data: [] }), countOverdueDeliveries: () => 3 }));
vi.mock("@/features/fleet", () => ({ useInsuranceAlerts: () => ({ data: [] }) }));
vi.mock("@/features/invoices", () => ({ useUpcomingInvoices: (enabled: boolean) => { state.upcomingQuery(enabled); return { data: [{ id: "cached-invoice" }] }; } }));
vi.mock("../../useFinancialKpis", () => ({ useFinancialKpis: (enabled: boolean) => { state.financialQuery(enabled); return { data: { mrr: 1000, dso: 10, overdue_total: 200, expiring_contracts: [{ id: "cached-contract" }] }, isError: false, isLoading: false }; } }));
vi.mock("../../useDashboardStats", () => ({ useDashboardStats: () => ({ data: {
  fleet_counts: { total: 10, available: 7, rented: 3, maintenance: 0, retired: 0, sold: 0 },
  invoice_stats: { outstanding_revenue: 1000, breakdown: [{ status: "sent", total: 1000, count: 1 }] },
  overdue_invoices: [{ id: "cached-invoice", due_date: "2026-10-01", total: 1000 }],
  cash_flow: [{ month: "Oct", invoiced: 1000, paid: 500 }],
  utilization: [{ name: "Equipment", revenue: 1000 }],
  monthly_utilization: [{ month_label: "Oct", utilization: 30 }],
  overdue_bookings: [{ booking_id: "operation" }],
} }) }));

beforeEach(() => { state.role = "dispatcher"; vi.clearAllMocks(); });

describe("Dashboard dispatcher financial data boundary", () => {
  it("disables financial queries and excludes cached finance data while preserving operation", () => {
    const { result } = renderHook(() => useDashboardSections());
    expect(state.financialQuery).toHaveBeenCalledWith(false);
    expect(state.upcomingQuery).toHaveBeenCalledWith(false);
    expect(result.current.canSeeFinancials).toBe(false);
    expect(result.current.canViewFinancialCharts).toBe(false);
    expect(result.current.cashFlowData).toEqual([]);
    expect(result.current.overdueInvoices).toEqual([]);
    expect(result.current.invoiceBreakdown).toEqual([]);
    expect(result.current.revenuePerUnit).toEqual([]);
    expect(result.current.alertsProps.upcomingInvoices).toEqual([]);
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
    state.role = "dispatcher";
    rerender();
    expect(result.current.cashFlowData).toEqual([]);
    expect(result.current.financials.mrr).toBe(0);
  });
  it("fails closed while role identity is unresolved", () => {
    state.role = null;
    const { result } = renderHook(() => useDashboardSections());
    expect(result.current.canViewFinancialCharts).toBe(false);
    expect(result.current.cashFlowData).toEqual([]);
    expect(state.financialQuery).toHaveBeenCalledWith(false);
  });
});
