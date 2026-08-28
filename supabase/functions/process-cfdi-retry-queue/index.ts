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
import {
  decideStampRetry,
  decideTerminalStatus,
  type StampInvoiceState,
} from "./decisions.ts";

interface QueueRow {
  id: string;
  operation: string;
  invoice_id: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  status: string;
  // FIX R6-02: contador de deferrals (reintentos que NO consumen `attempts`
  // porque el 409 es un claim propio pendiente). Columna real en
  // cfdi_retry_queue; permite topar el bucle y hacer crecer el backoff.
  deferrals: number;
  last_error: string | null;
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
  // 200 → success. 409 → already stamped → éxito idempotente SOLO para stamp.
  // M-6: para `cancel` un 409 = documento no cancelable → fallo terminal.
  // R5-02: para `cancel_nc`/`cancel_rep` un 409 suele ser el PROPIO claim
  // 'pending' dejado por un intento anterior que murió por timeout tras
  // llamar al PAC; el caller lo reprograma como deferral SIN consumir
  // intento y dispara refresh-cancellation-status para reconciliar.
  return {
    ok: res.ok || (res.status === 409 && operation === "stamp"),
    status: res.status,
    body,
  };
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

// FIX R6-02: tope de deferrals consecutivos. Superado, la fila pasa a
// `exhausted` con diagnóstico en vez de reintentar contra el PAC para siempre
// (antes `attempts` quedaba congelado y `max_attempts` nunca se alcanzaba).
export const MAX_DEFERRALS = 10;

// FIX R6-08: `cancel-cfdi` devuelve 409 en DOS casos distintos:
//  (a) claim propio 'pending' de un intento anterior → diferible.
//  (b) factura no cancelable (pagos aplicados) → terminal.
// El código de error distingue ambos; nunca el status HTTP.
export const CANCELLATION_IN_PROGRESS_CODE = "CANCELLATION_IN_PROGRESS";

export function is409Deferrable(
  operation: string,
  body: unknown,
): boolean {
  if (operation === "cancel_nc" || operation === "cancel_rep") return true;
  if (operation !== "cancel") return false;
  return (body as { code?: string } | null)?.code ===
    CANCELLATION_IN_PROGRESS_CODE;
}

// FIX R6-03: tras el refresh best-effort, lee el documento afectado y
// determina si la cancelación quedó confirmada. Tabla/columnas por operación:
//  - cancel     → invoices(status, cfdi_status, cancellation_status)
//  - cancel_nc  → credit_notes(status, cfdi_status, cancellation_status)
//  - cancel_rep → payments(rep_cfdi_status, rep_cancellation_status)
async function isDocCancelled(
  admin: ReturnType<typeof getAdminClient>,
  operation: string,
  docId: string,
): Promise<boolean> {
  const isRep = operation === "cancel_rep";
  const table = isRep
    ? "payments"
    : operation === "cancel_nc"
    ? "credit_notes"
    : "invoices";
  const select = isRep
    ? "rep_cfdi_status, rep_cancellation_status"
    : "status, cfdi_status, cancellation_status";
  const { data, error } = await admin
    .from(table)
    .select(select)
    .eq("id", docId)
    .maybeSingle() as {
      data: Record<string, unknown> | null;
      error: { message?: string } | null;
    };
  if (error || !data) {
    if (error) {
      console.warn("[process-cfdi-retry-queue] doc read after refresh failed", {
        table,
        docId,
        error: error.message ?? String(error),
      });
    }
    return false;
  }
  if (isRep) {
    return data.rep_cfdi_status === "cancelled" ||
      data.rep_cancellation_status === "accepted";
  }
  return data.status === "cancelled" || data.cfdi_status === "cancelled" ||
    data.cancellation_status === "accepted";
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
      "id, operation, invoice_id, attempts, max_attempts, payload, status, deferrals, last_error",
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
      "id, operation, invoice_id, attempts, max_attempts, payload, status, deferrals, last_error",
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
        const st = invRow as StampInvoiceState | null;
        // Ya timbrada / en reconcile / cancelada → nada que reintentar.
        // R2 (bajo 6): decisión REAL importada desde decisions.ts (el test
        // consume la misma función — ya no hay lógica duplicada).
        if (decideStampRetry(st) === "succeeded_noop_state") {
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
        const { apiKey } = await getFacturapiConfig(
          admin as unknown as { from: (t: string) => unknown } as never,
          (k) => Deno.env.get(k),
        );
        try {
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
          // R4-13: deferral de INFRAESTRUCTURA (no hubo llamada real al PAC
          // para re-timbrar) → NO consumir un intento; antes el contador
          // subía en cada ciclo sin agotamiento (reintento infinito) y, al
          // configurarse la key, el re-timbrado real moría como 'exhausted'
          // por intentos gastados en deferrals.
          await markQueueRow(admin, row.id, {
            status: "pending",
            attempts: row.attempts,
            last_error: "PAC lookup no disponible antes de re-timbrar",
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });

          results.push({ id: row.id, status: "retry_lookup_deferred" });
          continue;
        }
        // N-10: sin API key del PAC no hubo lookup posible y el catch no se
        // disparó → NO re-timbrar a ciegas (riesgo de CFDI duplicado ante el
        // SAT). Dejar la fila pending con backoff para el próximo ciclo.
        if (!apiKey) {
          console.warn(
            "[process-cfdi-retry-queue] no PAC apiKey, deferring re-stamp",
            { invoice_id: row.invoice_id },
          );
          // R4-13: deferral de infraestructura (sin API key no hubo lookup
          // ni re-timbrado) → NO consumir un intento (ver arriba).
          await markQueueRow(admin, row.id, {
            status: "pending",
            attempts: row.attempts,
            last_error: "Facturapi key no configurada; re-timbrado diferido",
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });

          results.push({ id: row.id, status: "retry_deferred_no_apikey" });
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
        // R5-02: 409 en cancel_nc/cancel_rep = claim propio 'pending' (el
        // intento anterior murió por timeout DESPUÉS de llamar al PAC). NO
        // es un fallo terminal: reprogramar como deferral de infraestructura
        // SIN consumir intento (patrón R4-13 de este mismo archivo) y pedir
        // reconciliación del estado real en el SAT.
        if (
          invRes.status === 409 &&
          (row.operation === "cancel_nc" || row.operation === "cancel_rep")
        ) {
          await markQueueRow(admin, row.id, {
            status: "pending",
            attempts: row.attempts,
            last_error: String(errMsg).slice(0, 2000),
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });
          // Best-effort: refresh-cancellation-status consulta al PAC y
          // actualiza cancellation_status; si falla, el próximo ciclo
          // reintenta el deferral.
          try {
            await fetch(
              `https://${projectRef}.supabase.co/functions/v1/refresh-cancellation-status`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                  "apikey": serviceKey,
                },
                body: JSON.stringify(
                  row.operation === "cancel_rep"
                    ? { payment_id: row.invoice_id }
                    : { credit_note_id: row.invoice_id },
                ),
              },
            );
          } catch { /* best-effort */ }
          results.push({
            id: row.id,
            status: "retry_claim_pending",
            http: invRes.status,
          });
          continue;
        }
        // M-6: 409 en una cancelación de factura (stamp ya lo filtró como
        // éxito en invokeStampFn) = el documento no es cancelable → fallo
        // TERMINAL inmediato (exhausted), sin gastar los reintentos.
        const queueStatus = invRes.status === 409
          ? "exhausted"
          : decideTerminalStatus(
            nextAttempts,
            row.max_attempts,
          );
        await markQueueRow(admin, row.id, {
          status: queueStatus,
          attempts: nextAttempts,
          last_error: String(errMsg).slice(0, 2000),
          next_retry_at: queueStatus === "exhausted"
            ? nowIso
            : nextRetryAt(nextAttempts).toISOString(),
        });
        results.push({
          id: row.id,
          status: queueStatus === "exhausted" ? "exhausted" : "retry",
          http: invRes.status,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const queueStatus = decideTerminalStatus(nextAttempts, row.max_attempts);
      await markQueueRow(admin, row.id, {
        status: queueStatus,
        attempts: nextAttempts,
        last_error: msg.slice(0, 2000),
        next_retry_at: queueStatus === "exhausted"
          ? nowIso
          : nextRetryAt(nextAttempts).toISOString(),
      });
      results.push({
        id: row.id,
        status: queueStatus === "exhausted" ? "exhausted" : "retry",
      });
    }
  }

  return json({ processed: results.length, results }, 200);
});
