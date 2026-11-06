import type { HistoricalReconciliation } from "../historicalReconciliation";
export const reconciliation: HistoricalReconciliation = {
  delivery_id: "d-1", organization_id: "org-1", classification: "closed_rental",
  reference_date: "2026-01-10", date_basis: "booking_start_authorized",
  evidence: { kind: "booking_closed", description: "Reserva cerrada administrativamente; sin devolución registrada" },
  reason: "Confirmación histórica", authorization_source: "Autorización de prueba",
  reconciled_at: "2026-11-05T12:00:00Z", revoked_at: null, revocation_reason: null,
};
