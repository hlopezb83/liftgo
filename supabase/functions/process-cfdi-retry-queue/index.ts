// EC-A1 — Consumidor de la cola cfdi_retry_queue.
//
// Corre por cron (pg_cron cada 5 min). Endpoint protegido con CRON_SECRET.
//
// NC-1 fix: estados alineados con el CHECK de `cfdi_retry_queue`:
//   pending → processing → (succeeded | exhausted | pending para retry)
// Los updates ahora chequean `error` y loguean si Postgres los rechaza.
//
// NC-2 fix: exige header `x-cron-secret` (o Authorization: Bearer <secret>).
// Sin secret válido responde 401 — antes cualquier anónimo podía disparar
// la función y consumir cuota Facturapi.
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { nextRetryAt } from "../_shared/cfdiRetryQueue.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
  retryOnFacturapi5xx,
} from "../_shared/facturapi/client.ts";

interface QueueRow {
  id: string;
  operation: string;
  invoice_id: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  status: string;
}

// EC-A1 fix: alineado con OPERATION en cfdi_retry_queue (`stamp | cancel |
// cancel_nc | cancel_rep`) y con los nombres reales de las edge functions.
// El mapping anterior apuntaba a `cancel-rep`, función inexistente.
// TESTS-ARQ2 (v7.220.0 DIFF 3): exportado para que el test consuma el mapa
// real (antes copiaba la tabla y no detectaba drift).
export const OPERATION_TO_FUNCTION: Record<string, string> = {
  stamp: "stamp-cfdi",
  cancel: "cancel-cfdi",
  cancel_nc: "cancel-credit-note",
  cancel_rep: "cancel-payment-complement",
};

async function invokeStampFn(
  fnName: string,
  operation: string,
  invoiceId: string,
  serviceKey: string,
  projectRef: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://${projectRef}.supabase.co/functions/v1/${fnName}`;
  // La cola guarda el id del recurso en `cfdi_retry_queue.invoice_id` (única
  // columna uuid disponible), pero cada edge function espera un nombre
  // distinto en el body:
  //  - stamp / cancel     → invoice_id      (facturas)
  //  - cancel_nc          → credit_note_id  (notas de crédito)
  //  - cancel_rep         → payment_id      (complementos de pago)
  // BLOQUE 3.1: antes de este fix `cancel_nc` mandaba `invoice_id` y la
  // función respondía 400 "credit_note_id must be UUID" en cada retry.
  const idKey = operation === "cancel_rep"
    ? "payment_id"
    : operation === "cancel_nc"
    ? "credit_note_id"
    : "invoice_id";
  const bodyToSend = { ...(payload ?? {}), [idKey]: invoiceId };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
    },
    body: JSON.stringify(bodyToSend),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch { /* text-only response */ }
  // 200 → success. 409 → already stamped/cancelled → tratar como éxito idempotente.
  return { ok: res.ok || res.status === 409, status: res.status, body };
}

/**
 * NC-1: helper que chequea el `error` devuelto por Postgres. Sin este check,
 * un CHECK constraint violation deja la fila en `pending` para siempre y el
 * consumer no lo sabe (el pipeline se rompe silenciosamente).
 */
async function markQueueRow(
  admin: ReturnType<typeof getAdminClient>,
  id: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await admin
    .from("cfdi_retry_queue")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[process-cfdi-retry-queue] update failed", {
      row_id: id,
      patch,
      error: (error as { message?: string }).message ?? String(error),
    });
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef =
    (Deno.env.get("SUPABASE_URL") ?? "").match(/https:\/\/([^.]+)\./)?.[1] ??
      Deno.env.get("SUPABASE_PROJECT_ID") ?? "";
  if (!serviceKey || !projectRef) {
    console.error("[process-cfdi-retry-queue] missing env");
    return json({ error: "Server misconfigured" }, 500);
  }

  // Lote C · DIFF 8 rest: auth timing-safe centralizada en _shared/cronAuth.ts.
  const admin = getAdminClient();
  const auth = await authenticateCronRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const nowIso = new Date().toISOString();
  // Filas 'processing' que quedaron huérfanas porque la ejecución anterior
  // murió (wall-clock del isolate, redeploy). Pasado este tiempo se reclaman.
  const STALE_PROCESSING_MIN = 15;
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MIN * 60_000)
    .toISOString();

  const { data: pendingRows, error } = await admin
    .from("cfdi_retry_queue")
    .select(
      "id, operation, invoice_id, attempts, max_attempts, payload, status",
    )
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("[process-cfdi-retry-queue] fetch failed", error);
    return json({ error: "Queue fetch failed" }, 500);
  }

  const { data: staleRows, error: staleErr } = await admin
    .from("cfdi_retry_queue")
    .select(
      "id, operation, invoice_id, attempts, max_attempts, payload, status",
    )
    .eq("status", "processing")
    .lt("updated_at", staleCutoff)
    .order("updated_at", { ascending: true })
    .limit(10);

  if (staleErr) {
    console.error(
      "[process-cfdi-retry-queue] stale processing fetch failed",
      staleErr,
    );
    // No fatal: seguimos con las pendientes.
  }

  const queue = [
    ...((pendingRows ?? []) as QueueRow[]),
    ...((staleRows ?? []) as QueueRow[]),
  ].slice(0, 25);
  const results: Array<{ id: string; status: string; http?: number }> = [];

  for (const row of queue) {
    const fnName = OPERATION_TO_FUNCTION[row.operation];
    if (!fnName) {
      // Operación desconocida → terminal.
      await markQueueRow(admin, row.id, {
        status: "exhausted",
        last_error: `Unknown operation: ${row.operation}`,
      });
      results.push({ id: row.id, status: "exhausted" });
      continue;
    }

    // NC-1: claim optimista → `processing`. Si el update falla o no matchea
    // (otra corrida ya lo tomó), saltamos la fila para evitar doble consumo.
    // Filtramos por el status que observamos al leer la fila (pending o
    // processing huérfano) para reclamar de forma atómica.
    const claim = await admin
      .from("cfdi_retry_queue")
      .update({ status: "processing", updated_at: nowIso })
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id")
      .maybeSingle();
    const claimErr = (claim as { error?: unknown }).error;
    if (claimErr) {
      console.error("[process-cfdi-retry-queue] claim failed", {
        row_id: row.id,
        err: claimErr,
      });
      results.push({ id: row.id, status: "claim_error" });
      continue;
    }
    // BLOQUE 2.3: sin fila reclamada (otro corredor la ganó, o el status
    // cambió entre lectura y update) → saltamos para evitar doble consumo.
    if (!(claim as { data?: unknown }).data) {
      results.push({ id: row.id, status: "claim_skipped" });
      continue;
    }

    const nextAttempts = row.attempts + 1;
    try {
      // Riesgo residual (Baja): antes de RE-TIMBRAR verificar que el intento
      // anterior realmente no timbró. Un 5xx del PAC pudo emitir el CFDI
      // server-side; el claim admite 'error'+uuid NULL y re-timbraría un
      // duplicado ante el SAT.
      if (row.operation === "stamp") {
        const { data: invRow } = await admin
          .from("invoices")
          .select("cfdi_status, cfdi_uuid")
          .eq("id", row.invoice_id)
          .maybeSingle();
        const st = invRow as
          | { cfdi_status?: string; cfdi_uuid?: string | null }
          | null;
        // Ya timbrada / en reconcile / cancelada → nada que reintentar.
        if (
          !st || st.cfdi_uuid ||
          (st.cfdi_status !== "pending" && st.cfdi_status !== "error")
        ) {
          await markQueueRow(admin, row.id, {
            status: "succeeded",
            attempts: nextAttempts,
            last_error: null,
          });
          results.push({ id: row.id, status: "succeeded_noop_state" });
          continue;
        }
        // Lookup al PAC por external_id: si el 5xx timbró server-side,
        // recuperamos los ids y dejamos que reconcile-stamping-invoices
        // descargue el XML — en vez de emitir un CFDI duplicado.
        try {
          const { apiKey } = await getFacturapiConfig(
            admin as unknown as { from: (t: string) => unknown } as never,
            (k) => Deno.env.get(k),
          );
          if (apiKey) {
            const pacClient = createFacturapiClient(apiKey);
            const listFn = (pacClient.invoices as unknown as {
              list?: (q: Record<string, unknown>) => Promise<unknown>;
            }).list;
            if (typeof listFn === "function") {
              const res = await retryOnFacturapi5xx(() =>
                listFn.call(pacClient.invoices, {
                  q: row.invoice_id,
                  limit: 5,
                }) as Promise<unknown>
              );
              const data = ((res as { data?: unknown }).data ?? []) as Array<
                Record<string, unknown>
              >;
              const hit = data.find((d) =>
                String((d as { external_id?: unknown }).external_id ?? "") ===
                  row.invoice_id
              );
              if (
                hit && typeof hit.id === "string" &&
                typeof hit.uuid === "string"
              ) {
                await admin.from("invoices")
                  .update({
                    facturapi_invoice_id: hit.id,
                    cfdi_uuid: hit.uuid,
                    cfdi_status: "stamping", // reconcile descarga el XML y cierra
                  })
                  .eq("id", row.invoice_id);
                await markQueueRow(admin, row.id, {
                  status: "succeeded",
                  attempts: nextAttempts,
                  last_error: null,
                });
                results.push({
                  id: row.id,
                  status: "succeeded_recovered_from_pac",
                });
                continue;
              }
            }
          }
        } catch (lookupErr) {
          // Lookup no disponible: NO re-timbrar a ciegas. Dejar la fila en
          // pending para el próximo ciclo (backoff normal).
          console.warn(
            "[process-cfdi-retry-queue] pac lookup failed, deferring",
            {
              invoice_id: row.invoice_id,
              err: describeFacturapiError(lookupErr).message,
            },
          );
          await markQueueRow(admin, row.id, {
            status: "pending",
            attempts: nextAttempts,
            last_error: "PAC lookup no disponible antes de re-timbrar",
            next_retry_at: nextRetryAt(nextAttempts).toISOString(),
          });
          results.push({ id: row.id, status: "retry_lookup_deferred" });
          continue;
        }
      }

      const invRes = await invokeStampFn(
        fnName,
        row.operation,
        row.invoice_id,
        serviceKey,
        projectRef,
        row.payload ?? {},
      );

      if (invRes.ok) {
        await markQueueRow(admin, row.id, {
          status: "succeeded",
          attempts: nextAttempts,
          last_error: null,
        });
        results.push({
          id: row.id,
          status: "succeeded",
          http: invRes.status,
        });
      } else {
        const errMsg = (invRes.body as { error?: string } | null)?.error ??
          String(invRes.body);
        const isTerminal = nextAttempts >= row.max_attempts;
        await markQueueRow(admin, row.id, {
          status: isTerminal ? "exhausted" : "pending",
          attempts: nextAttempts,
          last_error: String(errMsg).slice(0, 2000),
          next_retry_at: isTerminal
            ? nowIso
            : nextRetryAt(nextAttempts).toISOString(),
        });
        results.push({
          id: row.id,
          status: isTerminal ? "exhausted" : "retry",
          http: invRes.status,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTerminal = nextAttempts >= row.max_attempts;
      await markQueueRow(admin, row.id, {
        status: isTerminal ? "exhausted" : "pending",
        attempts: nextAttempts,
        last_error: msg.slice(0, 2000),
        next_retry_at: isTerminal
          ? nowIso
          : nextRetryAt(nextAttempts).toISOString(),
      });
      results.push({ id: row.id, status: isTerminal ? "exhausted" : "retry" });
    }
  }

  return json({ processed: results.length, results }, 200);
});
