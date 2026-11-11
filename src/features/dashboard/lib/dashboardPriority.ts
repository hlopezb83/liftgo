import type { AppRole } from "@/lib/domain/roles";

export type DashboardPriority = "operations" | "finance" | "maintenance" | "overview";
export type DashboardAlertGroup = "transport" | "returns" | "collection" | "maintenance";

export const DASHBOARD_ALERT_ORDER: Record<DashboardPriority, readonly DashboardAlertGroup[]> = {
  operations: ["transport", "returns", "maintenance", "collection"],
  finance: ["collection", "transport", "returns", "maintenance"],
  maintenance: ["maintenance", "transport", "returns", "collection"],
  overview: ["transport", "returns", "collection", "maintenance"],
};

export const DASHBOARD_PRIORITY_LABEL: Record<DashboardPriority, string> = {
  operations: "Pendientes de despacho",
  finance: "Pendientes de cobranza",
  maintenance: "Pendientes de mantenimiento",
  overview: "Pendientes de seguimiento",
};

/** Ordering is presentation only; existing access checks still own visibility. */
export function dashboardPriority(role: AppRole | null | undefined, canViewCollection: boolean): DashboardPriority {
  if (role === "dispatcher") return "operations";
  if (role === "mechanic") return "maintenance";
  if (canViewCollection && (role === "admin" || role === "administrativo" || role === "auditor")) return "finance";
  return "overview";
}
