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
  cfdi_status?: string;
  cfdi_uuid?: string | null;
}

/**
 * FIX-15: antes de re-timbrar, si la factura ya no está en pending|error o
 * ya tiene cfdi_uuid, el reintento debe tratarse como no-op exitoso (no se
 * vuelve a invocar stamp-cfdi → no hay riesgo de CFDI duplicado).
 */
export function decideStampRetry(
  st: StampInvoiceState | null,
): "succeeded_noop_state" | "proceed" {
  if (
    !st || st.cfdi_uuid ||
    (st.cfdi_status !== "pending" && st.cfdi_status !== "error")
  ) {
    return "succeeded_noop_state";
  }
  return "proceed";
}
