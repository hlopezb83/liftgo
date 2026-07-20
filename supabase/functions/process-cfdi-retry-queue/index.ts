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

interface QueueRow {
  id: string;
  operation: string;
  invoice_id: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
}

// EC-A1 fix: alineado con OPERATION en cfdi_retry_queue (`stamp | cancel |
// cancel_nc | cancel_rep`) y con los nombres reales de las edge functions.
// El mapping anterior apuntaba a `cancel-rep`, función inexistente.
const OPERATION_TO_FUNCTION: Record<string, string> = {
  stamp: "stamp-cfdi",
  cancel: "cancel-cfdi",
  cancel_nc: "cancel-credit-note",
  cancel_rep: "cancel-payment-complement",
};

async function invokeStampFn(
  fnName: string,
  invoiceId: string,
  serviceKey: string,
  projectRef: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://${projectRef}.supabase.co/functions/v1/${fnName}`;
  const bodyToSend = { ...(payload ?? {}), invoice_id: invoiceId };
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

  // NC-2: gating de auth. Aceptamos:
  //  - Header `x-cron-secret: <CRON_SECRET>` (uso recomendado desde pg_cron).
  //  - `Authorization: Bearer <CRON_SECRET>` (compat con Scheduled Functions).
  //  - `Authorization: Bearer <service_role>` (llamadas administrativas puntuales).
  // El secreto se resuelve desde Deno.env o, si está vacío, desde vault vía
  // RPC `internal_get_cron_secret()` — así pg_cron y edge functions comparten
  // la misma fuente de verdad sin duplicar el valor.
  const admin = getAdminClient();
  let cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  if (!cronSecret) {
    const { data: vaultSecret } = await admin.rpc("internal_get_cron_secret");
    cronSecret = typeof vaultSecret === "string" ? vaultSecret : "";
  }
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const authorized = (cronSecret.length > 0 &&
    (headerSecret === cronSecret || bearer === cronSecret)) ||
    (serviceKey.length > 0 && bearer === serviceKey);
  if (!authorized) {
    return json({ error: "Unauthorized" }, 401);
  }

  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("cfdi_retry_queue")
    .select("id, operation, invoice_id, attempts, max_attempts, payload")
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("[process-cfdi-retry-queue] fetch failed", error);
    return json({ error: "Queue fetch failed" }, 500);
  }

  const queue = (rows ?? []) as QueueRow[];
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
    const claim = await admin
      .from("cfdi_retry_queue")
      .update({ status: "processing", updated_at: nowIso })
      .eq("id", row.id)
      .eq("status", "pending");
    const claimErr = (claim as { error?: unknown }).error;
    if (claimErr) {
      console.error("[process-cfdi-retry-queue] claim failed", {
        row_id: row.id,
        err: claimErr,
      });
      results.push({ id: row.id, status: "claim_error" });
      continue;
    }

    const nextAttempts = row.attempts + 1;
    try {
      const invRes = await invokeStampFn(
        fnName,
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
