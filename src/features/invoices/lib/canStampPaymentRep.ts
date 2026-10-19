interface RepStampState {
  rep_cfdi_status?: string | null;
  rep_facturapi_id?: string | null;
  rep_cfdi_uuid?: string | null;
}

/** Only locally unissued payments can start or retry stamping from the UI. */
export function canStampPaymentRep(payment: RepStampState): boolean {
  if (payment.rep_facturapi_id || payment.rep_cfdi_uuid) return false;
  const status = payment.rep_cfdi_status ?? "none";
  // pending is also the handler's pre-PAC failure state. stamping remains
  // reserved for reconciliation, even when its claim has become stale.
  return status === "none" || status === "pending" || status === "error";
}
