import type { Json, Tables } from "@/integrations/supabase/types";

/** Read-only ledger contract, independent of generated database types. */
export interface HistoricalReconciliation {
  delivery_id: string;
  organization_id: string;
  classification: "closed_rental" | "equipment_sale";
  reference_date: string;
  date_basis: "booking_start_authorized" | "sale_invoice_issued_authorized";
  evidence: Json;
  reason: string;
  reconciled_at: string;
  authorization_source: string;
  revoked_at: string | null;
  revocation_reason: string | null;
}
export type ReconciledDelivery = Tables<"deliveries"> & {
  forklifts: { name: string; model: string } | null;
  historical_reconciliation: HistoricalReconciliation | null;
};
export type HistoricalDeliveryLike = { historical_reconciliation?: HistoricalReconciliation | null };
export function isHistoricallyReconciled(delivery: HistoricalDeliveryLike): boolean {
  return !!delivery.historical_reconciliation && delivery.historical_reconciliation.revoked_at === null;
}
export function historicalClassificationLabel(classification: HistoricalReconciliation["classification"]): string {
  return classification === "equipment_sale" ? "Venta de equipo" : "Renta cerrada";
}
export function selectDeliveryHistory<T extends HistoricalDeliveryLike>(deliveries: T[], view: string): T[] {
  if (view === "history") return deliveries;
  return deliveries.filter((delivery) => view === "reconciled"
    ? isHistoricallyReconciled(delivery) : !isHistoricallyReconciled(delivery));
}

export function canCorrectHistoricalDelivery(delivery: HistoricalDeliveryLike & { status: string }, role: string | null | undefined): boolean {
  return role === "admin" && delivery.status === "completed" && !isHistoricallyReconciled(delivery);
}
