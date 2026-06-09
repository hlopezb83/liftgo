export type SupplierRepStatus = "not_required" | "pending" | "received" | "rejected";

export const SUPPLIER_REP_STATUSES: SupplierRepStatus[] = [
  "not_required",
  "pending",
  "received",
  "rejected",
];

export const SUPPLIER_REP_STATUS_LABELS: Record<SupplierRepStatus, string> = {
  not_required: "No requiere",
  pending: "Pendiente",
  received: "Recibido",
  rejected: "Rechazado",
};
