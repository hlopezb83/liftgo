import { Truck, CheckCircle, Clock, Wrench, ShoppingCart } from "lucide-react";

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
