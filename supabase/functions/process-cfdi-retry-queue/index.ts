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
} from "../_shared/facturapi/client.ts";
import { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import {
  FiscalRetryContextError,
  getRetryAwareFacturapiConfig,
} from "../_shared/facturapi/retryContext.ts";
import {
  classifyInvoiceReadOutcome,
  decideStampRetry,
  decideTerminalStatus,
  resolveStampRetryOrganization,
  type StampInvoiceState,
} from "./decisions.ts";
import type { OrgQueryClient } from "../_shared/orgContext.ts";
import {
  assertOwnedQueue,
  claimQueueLease,
  markOwnedQueueRow,
  QueueMutationError,
} from "./queueLease.ts";
import {
  InvoiceRecoveryError,
  type RecoveryInvoice,
  saveRecoveredInvoice,
} from "./recoveredInvoice.ts";

interface QueueRow {
  id: string;
  organization_id: string;
  updated_at: string;
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
  fetchFn: typeof fetch,
  retryContext: { id: string; token: string },
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
  const bodyToSend: Record<string, unknown> = {
    ...(payload ?? {}),
    [idKey]: invoiceId,
    retry_queue: retryContext,
  };
  delete bodyToSend._fiscal_context;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
      "apikey": serviceKey,
    },
    body: JSON.stringify(bodyToSend),
    signal: AbortSignal.timeout(15_000),
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
  organizationId: string,
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
    .eq("organization_id", organizationId)
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

// MON-02: presupuesto de tiempo y lotes más chicos por corrida (el cron
// corre cada 5 min, así que el trabajo restante se procesa enseguida).
const RUN_BUDGET_MS = 50_000;
const RUN_PENDING_LIMIT = 10;
const RUN_STALE_LIMIT = 5;

// Deps inyectables SOLO para tests (nunca cambian el comportamiento por
// defecto en producción): permiten simular `admin`/`env` sin abrir un
// cliente Supabase real ni requerir --allow-net.
export interface HandleRequestDeps {
  admin?: OrgQueryClient;
  env?: (key: string) => string | undefined;
  authenticate?: typeof authenticateCronRequest;
  lookup?: typeof lookupPacInvoice;
  fetch?: typeof fetch;
}

export async function handleRequest(
  req: Request,
  deps: HandleRequestDeps = {},
): Promise<Response> {
  const RUN_STARTED_AT = Date.now();
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });
  const envGet = deps.env ?? ((k: string) => Deno.env.get(k));

  const serviceKey = envGet("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef =
    (envGet("SUPABASE_URL") ?? "").match(/https:\/\/([^.]+)\./)?.[1] ??
      envGet("SUPABASE_PROJECT_ID") ?? "";
  if (!serviceKey || !projectRef) {
    console.error("[process-cfdi-retry-queue] missing env");
    return json({ error: "Server misconfigured" }, 500);
  }

  // Lote C · DIFF 8 rest: auth timing-safe centralizada en _shared/cronAuth.ts.
  const admin = (deps.admin ?? getAdminClient()) as unknown as ReturnType<
    typeof getAdminClient
  >;
  const auth = await (deps.authenticate ?? authenticateCronRequest)(req);
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
      "id, organization_id, updated_at, operation, invoice_id, attempts, max_attempts, payload, status, deferrals, last_error",
    )
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(RUN_PENDING_LIMIT);

  if (error) {
    console.error("[process-cfdi-retry-queue] fetch failed", error);
    return json({ error: "Queue fetch failed" }, 500);
  }

  const { data: staleRows, error: staleErr } = await admin
    .from("cfdi_retry_queue")
    .select(
      "id, organization_id, updated_at, operation, invoice_id, attempts, max_attempts, payload, status, deferrals, last_error",
    )
    .eq("status", "processing")
    .lt("updated_at", staleCutoff)
    .order("updated_at", { ascending: true })
    .limit(RUN_STALE_LIMIT);

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
  ].slice(0, RUN_PENDING_LIMIT);
  const results: Array<{ id: string; status: string; http?: number }> = [];
  let truncated = false;

  for (const row of queue) {
    // MON-02: presupuesto de reloj por ejecución. Sin él, un lote con varias
    // llamadas lentas al PAC excedía el límite del runtime (504) o moría a
    // media corrida (502). Lo que no alcanza se retoma en el siguiente cron.
    if (Date.now() - RUN_STARTED_AT > RUN_BUDGET_MS) {
      truncated = true;
      break;
    }
    const fnName = OPERATION_TO_FUNCTION[row.operation];
    let lease;
    try {
      lease = await claimQueueLease(admin, row, nowIso);
    } catch {
      results.push({ id: row.id, status: "claim_error" });
      continue;
    }
    if (!lease) {
      results.push({ id: row.id, status: "claim_skipped" });
      continue;
    }

    const nextAttempts = row.attempts + 1;
    try {
      if (!fnName) {
        await markOwnedQueueRow(admin, lease, {
          status: "exhausted",
          last_error: `Unknown operation: ${row.operation}`,
        });
        results.push({ id: row.id, status: "exhausted" });
        continue;
      }
      // Riesgo residual (Baja): antes de RE-TIMBRAR verificar que el intento
      // anterior realmente no timbró. Un 5xx del PAC pudo emitir el CFDI
      // server-side; el claim admite 'error'+uuid NULL y re-timbraría un
      // duplicado ante el SAT.
      if (row.operation === "stamp") {
        const { data: invRowFull, error: invReadErr } = await admin
          .from("invoices")
          .select(
            "cfdi_status, cfdi_uuid, facturapi_invoice_id, organization_id, updated_at",
          )
          .eq("id", row.invoice_id)
          .eq("organization_id", row.organization_id)
          .maybeSingle();
        // 8.8.7: un fallo TRANSITORIO al leer la factura (BD no disponible)
        // NO es "factura sin organización". Se difiere con backoff, sin
        // consumir intento, sin PAC y sin agotar la fila; otras filas y
        // empresas siguen procesándose. La clasificación vive en
        // decisions.ts para que las pruebas usen la función REAL.
        const readOutcome = classifyInvoiceReadOutcome(
          invReadErr,
          invRowFull as { organization_id?: string | null } | null,
        );
        if (readOutcome.kind === "deferred") {
          console.warn(
            "[process-cfdi-retry-queue] lectura de invoices falló; se difiere",
            {
              invoice_id: row.invoice_id,
              err: (invReadErr as { message?: string })?.message ??
                String(invReadErr),
            },
          );
          await markOwnedQueueRow(admin, lease, {
            status: "pending",
            attempts: row.attempts,
            last_error:
              "Lectura de la factura no disponible; reintento diferido.",
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });
          results.push({ id: row.id, status: "deferred_invoice_read_error" });
          continue;
        }
        const st = invRowFull as StampInvoiceState | null;
        // Multiempresa · Fase 1: la organización SIEMPRE se deriva de la
        // factura leída en BD, NUNCA del payload de la cola (un elemento de
        // cfdi_retry_queue no puede pedir la empresa de otro). Sin
        // organización resoluble, la fila falla explícito sin llamar al PAC.
        // Multiempresa · Fase 1: `resolveStampRetryOrganization` IGNORA
        // cualquier organización que pudiera venir en `row.payload` (nunca
        // se lee de ahí) y usa SIEMPRE la de la factura leída en BD.
        const orgOutcome = resolveStampRetryOrganization(
          invRowFull as { organization_id?: string | null } | null,
        );
        const organizationId = orgOutcome.kind === "ok"
          ? orgOutcome.organizationId
          : null;
        if (orgOutcome.kind === "no_organization") {
          console.error(
            "[process-cfdi-retry-queue] documento no disponible en la empresa del trabajo",
            { invoice_id: row.invoice_id },
          );
          await markOwnedQueueRow(admin, lease, {
            status: "exhausted",
            attempts: nextAttempts,
            last_error:
              "Documento no disponible en la empresa del trabajo; no se puede resolver Facturapi.",
          });
          results.push({ id: row.id, status: "exhausted" });
          continue;
        }
        if (decideStampRetry(st) === "succeeded_noop_state") {
          await markOwnedQueueRow(admin, lease, {
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
        // La organización viene SIEMPRE de la fila de `invoices` leída
        // arriba, nunca del payload de la cola.
        let apiKey: string | null = null;
        let pacMode: "test" | "live" | undefined;
        try {
          const cfg = await getRetryAwareFacturapiConfig({
            admin,
            env: envGet,
            organizationId,
            body: { retry_queue: { id: lease.id, token: lease.updatedAt } },
            isServiceRole: true,
            documentId: row.invoice_id,
            operation: row.operation,
          });
          apiKey = cfg.apiKey;
          pacMode = cfg.mode;
        } catch (err) {
          if (err instanceof FiscalRetryContextError) throw err;
          console.error(
            "[process-cfdi-retry-queue] config lookup failed",
            {
              organization_id: organizationId,
              err: err instanceof Error ? err.message : String(err),
            },
          );
        }
        try {
          if (apiKey && pacMode) {
            await assertOwnedQueue(admin, lease);
            const pacClient = createFacturapiClient(apiKey);
            const pac = await (deps.lookup ?? lookupPacInvoice)(
              pacClient,
              row.invoice_id,
              st?.facturapi_invoice_id ?? null,
            );
            if (pac.kind === "hit" || pac.kind === "pending") {
              await saveRecoveredInvoice(
                admin,
                lease,
                row.invoice_id,
                invRowFull as RecoveryInvoice,
                pac,
                pacMode,
              );
              await markOwnedQueueRow(admin, lease, {
                status: "succeeded",
                attempts: nextAttempts,
                last_error: null,
              });
              results.push({
                id: row.id,
                status: pac.kind === "hit"
                  ? "succeeded_recovered_from_pac"
                  : "succeeded_pac_pending",
              });
              continue;
            }
            if (pac.kind === "failed") {
              await saveRecoveredInvoice(
                admin,
                lease,
                row.invoice_id,
                invRowFull as RecoveryInvoice,
                pac,
                pacMode,
              );
              await markOwnedQueueRow(admin, lease, {
                status: "exhausted",
                attempts: nextAttempts,
                last_error:
                  "Facturapi confirmó fallo; revisión manual requerida",
              });
              results.push({ id: row.id, status: "pac_failed_manual_review" });
              continue;
            }
            if (pac.kind === "lookup_failed") {
              throw new Error("Facturapi lookup inconcluso");
            }
          }
        } catch (lookupErr) {
          if (
            lookupErr instanceof QueueMutationError ||
            lookupErr instanceof InvoiceRecoveryError
          ) throw lookupErr;
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
          await markOwnedQueueRow(admin, lease, {
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
          await markOwnedQueueRow(admin, lease, {
            status: "pending",
            attempts: row.attempts,
            last_error: "Facturapi key no configurada; re-timbrado diferido",
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });

          results.push({ id: row.id, status: "retry_deferred_no_apikey" });
          continue;
        }
      }

      if (row.operation !== "stamp") {
        const table = row.operation === "cancel_rep"
          ? "payments"
          : row.operation === "cancel_nc"
          ? "credit_notes"
          : "invoices";
        const document = await admin.from(table).select("organization_id")
          .eq("id", row.invoice_id).eq("organization_id", lease.organizationId)
          .maybeSingle();
        if (document.error || !document.data) {
          await markOwnedQueueRow(admin, lease, {
            status: document.error ? "pending" : "exhausted",
            attempts: row.attempts,
            last_error:
              "No se pudo verificar el documento fiscal de esta empresa.",
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });
          results.push({
            id: row.id,
            status: document.error
              ? "deferred_document_read_error"
              : "document_unavailable",
          });
          continue;
        }
        await getRetryAwareFacturapiConfig({
          admin,
          env: envGet,
          organizationId: lease.organizationId,
          documentId: row.invoice_id,
          operation: row.operation,
          isServiceRole: true,
          body: { retry_queue: { id: lease.id, token: lease.updatedAt } },
        });
      }
      await assertOwnedQueue(admin, lease);
      const invRes = await invokeStampFn(
        fnName,
        row.operation,
        row.invoice_id,
        serviceKey,
        projectRef,
        row.payload ?? {},
        deps.fetch ?? fetch,
        { id: lease.id, token: lease.updatedAt },
      );

      if (
        (invRes.body as { code?: string } | null)?.code ===
          "FISCAL_RETRY_CHANGED"
      ) {
        throw new FiscalRetryContextError("changed");
      }
      if (
        (invRes.body as { code?: string } | null)?.code ===
          "FISCAL_RETRY_UNAVAILABLE"
      ) {
        throw new FiscalRetryContextError("unavailable");
      }
      if (invRes.ok) {
        await markOwnedQueueRow(admin, lease, {
          status: "succeeded",
          attempts: nextAttempts,
          last_error: null,
          // FIX R6-02: cerrar la fila resetea el contador de deferrals.
          deferrals: 0,
        });
        results.push({
          id: row.id,
          status: "succeeded",
          http: invRes.status,
        });
      } else {
        const errMsg = (invRes.body as { error?: string } | null)?.error ??
          String(invRes.body);
        // R5-02 + FIX R6-08: 409 con claim propio 'pending' (el intento
        // anterior murió por timeout DESPUÉS de llamar al PAC). NO es un fallo
        // terminal: reprogramar como deferral SIN consumir intento y pedir
        // reconciliación del estado real en el SAT. Para `cancel` solo aplica
        // cuando el body trae code=CANCELLATION_IN_PROGRESS; el otro 409
        // ("no cancelable") sigue siendo terminal.
        if (
          invRes.status === 409 && is409Deferrable(row.operation, invRes.body)
        ) {
          const deferrals = (row.deferrals ?? 0) + 1;
          // Best-effort: refresh-cancellation-status consulta al PAC y
          // actualiza cancellation_status; si falla, el próximo ciclo
          // reintenta el deferral.
          try {
            await assertOwnedQueue(admin, lease);
            const refreshRes = await (deps.fetch ?? fetch)(
              `https://${projectRef}.supabase.co/functions/v1/refresh-cancellation-status`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${serviceKey}`,
                  "apikey": serviceKey,
                },
                // FIX R6-23: timeout de 10s para que una función colgada no
                // consuma el wall-clock del lote de 25 filas.
                signal: AbortSignal.timeout(10_000),
                body: JSON.stringify(
                  row.operation === "cancel_rep"
                    ? {
                      payment_id: row.invoice_id,
                      retry_queue: { id: lease.id, token: lease.updatedAt },
                    }
                    : row.operation === "cancel_nc"
                    ? {
                      credit_note_id: row.invoice_id,
                      retry_queue: { id: lease.id, token: lease.updatedAt },
                    }
                    : {
                      invoice_id: row.invoice_id,
                      retry_queue: { id: lease.id, token: lease.updatedAt },
                    },
                ),
              },
            );
            // FIX R6-23: observar el resultado (antes se descartaba).
            if (!refreshRes.ok) {
              console.warn(
                "[process-cfdi-retry-queue] refresh-cancellation-status failed",
                { row_id: row.id, status: refreshRes.status },
              );
            }
          } catch (refreshErr) {
            if (refreshErr instanceof QueueMutationError) throw refreshErr;
            // FIX R6-23: catch con log (antes catch vacío).
            console.warn(
              "[process-cfdi-retry-queue] refresh-cancellation-status threw",
              {
                row_id: row.id,
                error: refreshErr instanceof Error
                  ? refreshErr.message
                  : String(refreshErr),
              },
            );
          }
          // FIX R6-03: si el refresh reconcilió la cancelación, la fila es un
          // ÉXITO, no un deferral más ni un exhausted espurio.
          if (
            await isDocCancelled(
              admin,
              row.operation,
              row.invoice_id,
              lease.organizationId,
            )
          ) {
            await markOwnedQueueRow(admin, lease, {
              status: "succeeded",
              attempts: row.attempts,
              last_error: null,
              deferrals: 0,
            });
            results.push({
              id: row.id,
              status: "succeeded",
              http: invRes.status,
            });
            continue;
          }
          if (deferrals > MAX_DEFERRALS) {
            // FIX R6-02: tope alcanzado → exhausted con diagnóstico.
            await markOwnedQueueRow(admin, lease, {
              status: "exhausted",
              attempts: row.attempts,
              deferrals,
              last_error:
                `MAX_DEFERRALS=${MAX_DEFERRALS} alcanzado tras ${deferrals} aplazamientos; último 409: ${
                  String(errMsg)
                }`.slice(0, 2000),
              next_retry_at: nowIso,
            });
            results.push({
              id: row.id,
              status: "exhausted",
              http: invRes.status,
            });
            continue;
          }
          await markOwnedQueueRow(admin, lease, {
            status: "pending",
            attempts: row.attempts,
            deferrals,
            last_error: String(errMsg).slice(0, 2000),
            // FIX R6-22: backoff creciente según el contador de deferrals
            // (2, 4, 8… min con tope de 60) en vez del fijo de ~2 min que
            // spameaba al PAC en cada ciclo.
            next_retry_at: nextRetryAt(deferrals).toISOString(),
          });
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
        await markOwnedQueueRow(admin, lease, {
          status: queueStatus,
          attempts: nextAttempts,
          // FIX R6-02: hubo un intento real → el contador de deferrals se
          // reinicia (solo cuentan los aplazamientos consecutivos).
          deferrals: 0,
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
      if (err instanceof FiscalRetryContextError) {
        try {
          await markOwnedQueueRow(admin, lease, {
            status: err.kind === "unavailable" ? "pending" : "exhausted",
            attempts: row.attempts,
            last_error: err.message,
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });
          results.push({ id: row.id, status: err.code });
        } catch (queueError) {
          results.push({
            id: row.id,
            status: queueError instanceof QueueMutationError
              ? queueError.kind
              : "queue_write_error",
          });
        }
        continue;
      }
      if (err instanceof QueueMutationError) {
        results.push({ id: row.id, status: err.kind });
        continue;
      }
      if (err instanceof InvoiceRecoveryError) {
        try {
          await markOwnedQueueRow(admin, lease, {
            status: "pending",
            attempts: row.attempts,
            last_error:
              "La factura recuperada no se confirmó en BD; revisar antes de volver a timbrar.",
            next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
          });
          results.push({ id: row.id, status: err.kind });
        } catch (queueError) {
          results.push({
            id: row.id,
            status: queueError instanceof QueueMutationError
              ? queueError.kind
              : "queue_write_error",
          });
        }
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      const queueStatus = decideTerminalStatus(nextAttempts, row.max_attempts);
      try {
        await markOwnedQueueRow(admin, lease, {
          status: queueStatus,
          attempts: nextAttempts,
          last_error: msg.slice(0, 2000),
          next_retry_at: queueStatus === "exhausted"
            ? nowIso
            : nextRetryAt(nextAttempts).toISOString(),
        });
      } catch (queueError) {
        results.push({
          id: row.id,
          status: queueError instanceof QueueMutationError
            ? queueError.kind
            : "queue_write_error",
        });
        continue;
      }
      results.push({
        id: row.id,
        status: queueStatus === "exhausted" ? "exhausted" : "retry",
      });
    }
  }

  return json({ processed: results.length, truncated, results }, 200);
}

if (import.meta.main) {
  Deno.serve((req) => handleRequest(req));
}
