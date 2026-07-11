import { Truck, CheckCircle, Clock, Wrench, ShoppingCart } from "@/components/icons";
import { formatMonthShortEs } from "@/lib/format/formatMonthEs";

export const STATUS_COLORS = {
  available: "hsl(var(--status-available))",
  rented: "hsl(var(--status-rented))",
  maintenance: "hsl(var(--status-maintenance))",
  retired: "hsl(var(--status-retired))",
  sold: "hsl(var(--status-sold))",
};

export const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "hsl(var(--status-draft))",
  sent: "hsl(var(--status-rented))",
  overdue: "hsl(var(--status-overdue))",
  paid: "hsl(var(--status-available))",
};

export type FleetCounts = {
  total: number; available: number; rented: number;
  maintenance: number; retired: number; sold: number;
};

export const EMPTY_COUNTS: FleetCounts = {
  total: 0, available: 0, rented: 0, maintenance: 0, retired: 0, sold: 0,
};

export function buildPieData(counts: FleetCounts) {
  return [
    { name: "Disponibles", value: counts.available, color: STATUS_COLORS.available },
    { name: "Rentados", value: counts.rented, color: STATUS_COLORS.rented },
    { name: "Mantenimiento", value: counts.maintenance, color: STATUS_COLORS.maintenance },
    { name: "Vendidos", value: counts.sold, color: STATUS_COLORS.sold },
  ].filter((d) => d.value > 0);
}

export function buildStatCards(counts: FleetCounts, activeFleet: number) {
  return [
    { label: "Flota Activa", value: activeFleet, icon: Truck, color: "text-primary" },
    { label: "Disponibles", value: counts.available, icon: CheckCircle, color: "text-status-available" },
    { label: "Rentados", value: counts.rented, icon: Clock, color: "text-status-rented" },
    { label: "Mantenimiento", value: counts.maintenance, icon: Wrench, color: "text-status-maintenance" },
    { label: "Vendidos", value: counts.sold, icon: ShoppingCart, color: "text-status-sold" },
  ];
}

export function mapMaintenanceAlerts(raw?: Array<{ forklift_name: string; next_date: string; forklift_id: string }>) {
  return (raw ?? []).map((a) => ({
    forkliftName: a.forklift_name,
    nextDate: a.next_date,
    forkliftId: a.forklift_id,
  }));
}

export function mapInvoiceBreakdown(raw?: Array<{ status: string; count: number; total: number }>) {
  return (raw ?? []).map((b) => ({
    status: b.status,
    count: b.count,
    total: b.total,
    color: INVOICE_STATUS_COLORS[b.status] ?? "hsl(var(--status-draft))",
  }));
}

type StatsLike = {
  monthly_utilization?: Array<{ month_label: string; utilization: number }>;
  utilization?: Array<{ name: string; revenue: number }>;
  cash_flow?: Array<{ month: string; month_key?: string; invoiced: number; paid: number }>;
  invoice_stats?: { outstanding_revenue?: number };
  overdue_bookings?: unknown;
};

export function mapMonthlyUtilization(stats?: StatsLike) {
  return (stats?.monthly_utilization ?? []).map((m) => ({ month_label: m.month_label, utilization: m.utilization }));
}

export function mapRevenuePerUnit(stats?: StatsLike) {
  return (stats?.utilization ?? []).filter((u) => u.revenue > 0).map((u) => ({ name: u.name, revenue: u.revenue }));
}

export function mapCashFlow(stats?: StatsLike) {
  return (stats?.cash_flow ?? []).map((cf) => ({
    month: cf.month_key ? formatMonthShortEs(cf.month_key) : cf.month,
    invoiced: cf.invoiced,
    paid: cf.paid,
  }));
}

type KpisLike = { mrr?: number; dso?: number; overdue_total?: number; expiring_contracts?: unknown };

export function buildFinancials(kpis?: KpisLike) {
  return {
    mrr: kpis?.mrr ?? 0,
    dso: kpis?.dso ?? 0,
    overdueTotal: kpis?.overdue_total ?? 0,
  };
}

export function buildAlertsProps<B, I, C>(
  stats: { overdue_bookings?: B[] } | undefined,
  upcomingInvoices: I[] | undefined,
  kpis: { expiring_contracts?: C[] } | undefined,
) {
  return {
    overdueBookings: stats?.overdue_bookings ?? ([] as B[]),
    upcomingInvoices: upcomingInvoices ?? ([] as I[]),
    expiringContracts: kpis?.expiring_contracts ?? ([] as C[]),
  };
}

export function computeUtilizationPercent(counts: FleetCounts, activeFleet: number) {
  return activeFleet > 0 ? Math.round((counts.rented / activeFleet) * 100) : 0;
}
