// BL-44: cola de reintento para operaciones CFDI que fallen por causas transitorias.
// El procesador (cron) se implementará en un cambio posterior; por ahora la cola
// se llena desde stamp-cfdi / cancel-cfdi cuando Facturapi responde 5xx o red muere.
import type { SupabaseLike } from "./types.ts";

export type CfdiRetryOperation =
  | "stamp"
  | "cancel"
  | "cancel_nc"
  | "cancel_rep";

export interface EnqueueCfdiRetryInput {
  operation: CfdiRetryOperation;
  invoiceId: string;
  payload: unknown;
  errorMessage?: string | null;
}

/**
 * Un error se considera transitorio cuando:
 *  - Es un fetch failure (sin status) — típicamente red caída.
 *  - Devuelve status 5xx (Facturapi caído, timeout de gateway).
 *  - Devuelve status 429 (rate limit).
 * NO son transitorios: 4xx de negocio (RFC inválido, XML malformado, etc.).
 */
export function isTransientFacturapiError(
  desc: { status?: number | null; code?: string | null; message?: string },
): boolean {
  const status = desc?.status ?? null;
  if (status === null) return true; // network / fetch failure
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

export async function enqueueCfdiRetry(
  admin: SupabaseLike,
  input: EnqueueCfdiRetryInput,
): Promise<{ id: string | null }> {
  const res = await admin
    .from("cfdi_retry_queue")
    .insert({
      operation: input.operation,
      invoice_id: input.invoiceId,
      payload: input.payload ?? {},
      attempts: 0,
      status: "pending",
      last_error: input.errorMessage?.slice(0, 2000) ?? null,
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (res.error) {
    // No queremos que un fallo de encolado tape el error original.
    console.error("[cfdiRetryQueue] enqueue failed", res.error);
    return { id: null };
  }
  return { id: res.data?.id ?? null };
}

/**
 * Backoff exponencial: 1min, 2min, 4min, 8min, 16min...
 */
export function nextRetryAt(attempts: number): Date {
  const minutes = Math.min(2 ** attempts, 60);
  return new Date(Date.now() + minutes * 60_000);
}
