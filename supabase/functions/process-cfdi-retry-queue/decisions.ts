// supabase/functions/process-cfdi-retry-queue/decisions.ts
// R2 (bajo 6): decisiones puras del consumer, extraídas de index.ts para que
// el test importe la función REAL (antes la reimplementaba inline y pasaba
// aunque FIX-15 / la política de estado terminal se rompieran).

/** NC-1: estado terminal `exhausted` cuando attempts alcanza max_attempts. */
export function decideTerminalStatus(
  attempts: number,
  maxAttempts: number,
): "exhausted" | "pending" {
  return attempts >= maxAttempts ? "exhausted" : "pending";
}

export interface StampInvoiceState {
  status?: string;
  cfdi_status?: string;
  cfdi_uuid?: string | null;
  facturapi_invoice_id?: string | null;
}

export function decideStampRetry(
  st: StampInvoiceState | null,
):
  | "succeeded_noop_state"
  | "succeeded_recovery_handoff"
  | "defer"
  | "rejected"
  | "proceed" {
  if (!st || st.status === "cancelled" || st.cfdi_status === "cancelled") {
    return "rejected";
  }
  if (st.cfdi_status === "stamped" && st.cfdi_uuid) {
    return "succeeded_noop_state";
  }
  if (st.cfdi_status === "stamping") {
    return st.facturapi_invoice_id ? "succeeded_recovery_handoff" : "defer";
  }
  if (
    !st.cfdi_uuid && !st.facturapi_invoice_id &&
    (st.cfdi_status === "pending" || st.cfdi_status === "error")
  ) return "proceed";
  return "rejected";
}

// Multiempresa · Fase 1: la organización del camino de reintento SIEMPRE se
// deriva de la fila/documento leído en BD, NUNCA del payload de la cola
// (`cfdi_retry_queue.payload` lo llena el request original; un elemento de
// la cola no puede "pedir" la empresa de otro). Sin organización resoluble
// no se puede llamar al PAC de forma segura.
export interface StampRetryInvoiceRow {
  organization_id?: string | null;
}

export type ResolveStampOrgOutcome =
  | { kind: "ok"; organizationId: string }
  | { kind: "no_organization" };

export function resolveStampRetryOrganization(
  invoiceRow: StampRetryInvoiceRow | null,
): ResolveStampOrgOutcome {
  const organizationId = invoiceRow?.organization_id ?? null;
  if (!organizationId) return { kind: "no_organization" };
  return { kind: "ok", organizationId };
}

/**
 * 8.8.7: distingue un FALLO TRANSITORIO de lectura (BD no disponible) de una
 * factura realmente sin organización. El primero se difiere con backoff, sin
 * consumir intento, sin PAC y sin agotar la fila; el segundo sí se agota.
 */
export type InvoiceReadOutcome =
  | { kind: "deferred" }
  | { kind: "no_organization" }
  | { kind: "ok"; organizationId: string };

export function classifyInvoiceReadOutcome(
  readError: unknown,
  invoiceRow: StampRetryInvoiceRow | null,
): InvoiceReadOutcome {
  if (readError) return { kind: "deferred" };
  return resolveStampRetryOrganization(invoiceRow);
}
