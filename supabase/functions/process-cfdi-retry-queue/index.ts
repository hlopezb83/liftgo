// EC-A1 — Consumidor de la cola cfdi_retry_queue.
// Corre en cron (config.toml → schedule) cada 5 minutos y procesa las filas
// `status='pending'` cuyo `next_retry_at <= now()` reinvocando `stamp-cfdi`
// (o `cancel-cfdi` para operaciones de cancelación) con el service_role JWT.
// Backoff exponencial: 2^attempts minutos (tope 60). max_attempts=5 → 'failed'.
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

const OPERATION_TO_FUNCTION: Record<string, string> = {
  stamp: "stamp-cfdi",
  cancel: "cancel-cfdi",
  cancel_nc: "cancel-credit-note",
  cancel_rep: "cancel-rep",
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

  const admin = getAdminClient();
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
      await admin.from("cfdi_retry_queue")
        .update({
          status: "failed",
          last_error: `Unknown operation: ${row.operation}`,
          updated_at: nowIso,
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: "failed" });
      continue;
    }

    // Advisory lock por invoice_id — evita procesar la misma factura en paralelo
    // si dos ejecuciones del cron se solapan.
    const lockKey = row.invoice_id;
    const { data: gotLock } =
      await admin.rpc("pg_try_advisory_xact_lock" as never, {
        key: lockKey,
      } as never).maybeSingle?.() ?? { data: null };
    // La RPC anterior no existe por defecto; fallback: procesar sin lock explícito.
    // La atomicidad real la garantiza el claim `cfdi_status IN (pending,error) AND cfdi_uuid IS NULL`
    // dentro de stamp-cfdi.
    void gotLock;

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
        await admin.from("cfdi_retry_queue")
          .update({
            status: "completed",
            attempts: nextAttempts,
            last_error: null,
            updated_at: nowIso,
          })
          .eq("id", row.id);
        results.push({
          id: row.id,
          status: "completed",
          http: invRes.status,
        });
      } else {
        const errMsg = (invRes.body as { error?: string } | null)?.error ??
          String(invRes.body);
        const isTerminal = nextAttempts >= row.max_attempts;
        await admin.from("cfdi_retry_queue")
          .update({
            status: isTerminal ? "failed" : "pending",
            attempts: nextAttempts,
            last_error: String(errMsg).slice(0, 2000),
            next_retry_at: isTerminal
              ? nowIso
              : nextRetryAt(nextAttempts).toISOString(),
            updated_at: nowIso,
          })
          .eq("id", row.id);
        results.push({
          id: row.id,
          status: isTerminal ? "failed" : "retry",
          http: invRes.status,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTerminal = nextAttempts >= row.max_attempts;
      await admin.from("cfdi_retry_queue")
        .update({
          status: isTerminal ? "failed" : "pending",
          attempts: nextAttempts,
          last_error: msg.slice(0, 2000),
          next_retry_at: isTerminal
            ? nowIso
            : nextRetryAt(nextAttempts).toISOString(),
          updated_at: nowIso,
        })
        .eq("id", row.id);
      results.push({ id: row.id, status: isTerminal ? "failed" : "retry" });
    }
  }

  return json({ processed: results.length, results }, 200);
});
