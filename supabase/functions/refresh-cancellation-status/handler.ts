// Pure handler for refresh-cancellation-status, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
  retrieveInvoiceWithSignal,
  updateInvoiceStatusWithSignal,
} from "../_shared/facturapi/client.ts";
import {
  isFacturapiTimeout,
  sdkCallWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const VALID_SAT_STATUSES = [
  "accepted",
  "pending",
  "rejected",
  "expired",
];
const TERMINAL_STATUSES = new Set(["accepted", "rejected", "expired"]);

export interface RefreshCancellationDeps {
  createCallerClient: (authHeader: string) => SupabaseLike;
  createServiceClient: () => SupabaseLike;
  fetchImpl: typeof fetch;
  env: (key: string) => string | undefined;
}

export async function handleRefreshCancellation(
  req: Request,
  deps: RefreshCancellationDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (body: unknown, status: number) =>
    jsonResponse(req, body, { status });

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[refresh-cancellation-status]",
    });
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    const supabase = auth.supabase;

    // M25: acepta invoice_id (facturas) O credit_note_id (notas de crédito).
    // Las NCs con cancelación pendiente ante el SAT no tenían vía de refresh
    // y bloqueaban NCs futuras vía el guard anti-sobre-acreditación (BL-08).
    // N-27: acepta TAMBIÉN payment_id para refrescar la cancelación del REP
    // (complemento de pago) persistida en `payments`.
    const { invoice_id, credit_note_id, payment_id } =
      (await req.json().catch(() => ({}))) as {
        invoice_id?: unknown;
        credit_note_id?: unknown;
        payment_id?: unknown;
      };
    const hasInvoice = isUUID(invoice_id);
    const hasCreditNote = isUUID(credit_note_id);
    const hasPayment = isUUID(payment_id);
    const provided = Number(hasInvoice) + Number(hasCreditNote) +
      Number(hasPayment);
    if (provided !== 1) {
      return json(
        {
          error:
            "Provide exactly one of invoice_id, credit_note_id or payment_id (valid UUID)",
        },
        400,
      );
    }
    const table = hasPayment
      ? "payments"
      : hasCreditNote
      ? "credit_notes"
      : "invoices";
    const isPayment = table === "payments";
    const docId = (hasPayment
      ? payment_id
      : hasCreditNote
      ? credit_note_id
      : invoice_id) as string;

    const { data: invoice } = await supabase
      .from(table)
      .select(
        isPayment
          ? "rep_facturapi_id, rep_cancellation_status, rep_cfdi_status, updated_at"
          : "facturapi_invoice_id, cancellation_status, updated_at",
      )
      .eq("id", docId)
      .single();
    const inv = invoice as Record<string, unknown> | null;
    const facturapiId =
      (isPayment ? inv?.rep_facturapi_id : inv?.facturapi_invoice_id) as
        | string
        | undefined;
    if (!inv || !facturapiId) {
      return json({ error: "Document has no Facturapi reference" }, 404);
    }

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    if (!apiKey) {
      return json({ error: "Facturapi key not configured" }, 400);
    }

    const fid = facturapiId;

    const client = createFacturapiClient(apiKey);
    let facturApiInv: Record<string, unknown> = {};
    try {
      // ARQ2-A1: ambas llamadas al PAC con timeout (SDK sin signal → race).
      try {
        const updated = await sdkCallWithTimeout((signal) =>
          updateInvoiceStatusWithSignal(client, fid, { signal })
        );
        if (updated && typeof updated === "object") {
          facturApiInv = updated as Record<string, unknown>;
        }
      } catch (e) {
        // Si updateStatus falla (404 SAT, timeout, etc.) seguimos con retrieve.
        if (isFacturapiTimeout(e)) {
          console.warn("[refresh-cancellation-status] updateStatus timeout", {
            fid,
          });
        }
      }
      if (!facturApiInv.cancellation_status) {
        facturApiInv = await sdkCallWithTimeout((signal) =>
          retrieveInvoiceWithSignal(client, fid, { signal })
        ) as Record<string, unknown>;
      }
    } catch (err) {
      // ARQ2-A1: timeout → conservar cancellation_status actual, responder 504 transient.
      if (isFacturapiTimeout(err)) {
        console.warn("[refresh-cancellation-status] facturapi timeout", {
          fid,
        });
        return json({
          error: "PAC no respondió a tiempo, reintenta",
          code: "TIMEOUT",
          transient: true,
        }, 504);
      }
      const desc = describeFacturapiError(err);
      return json(
        {
          error: `Facturapi status error: ${desc.status}`,
          detail: desc.detail,
        },
        502,
      );
    }
    const rawCancel =
      (facturApiInv?.cancellation_status as string | undefined) ??
        ((facturApiInv?.cancellation as Record<string, unknown> | undefined)
          ?.status as string | undefined);
    const rootStatus = facturApiInv?.status as string | undefined;
    const prior =
      ((isPayment ? inv.rep_cancellation_status : inv.cancellation_status) as
        | string
        | undefined) ?? "none";

    // Facturapi marca la cancelación aceptada bajando el `status` raíz a
    // "canceled" (a veces "cancelled") y no siempre poblando cancellation_status.
    let satStatus = prior;
    if (
      rootStatus === "canceled" || rootStatus === "cancelled" ||
      rawCancel === "accepted"
    ) {
      satStatus = "accepted";
    } else if (rawCancel && VALID_SAT_STATUSES.includes(rawCancel)) {
      // Nunca degradar un estado terminal a pending.
      if (!(TERMINAL_STATUSES.has(prior) && rawCancel === "pending")) {
        satStatus = rawCancel;
      }
    } else if (prior === "pending") {
      // N-11: el PAC no reporta la cancelación pero llevamos >72h en
      // 'pending' → la solicitud quedó huérfana (nunca llegó al SAT o el PAC
      // la perdió). Resetear a 'none' para desbloquear un nuevo intento.
      const requestedAt = inv.updated_at as string | null;
      const STALE_PENDING_MS = 72 * 60 * 60 * 1000;
      const ageMs = requestedAt
        ? Date.now() - new Date(requestedAt).getTime()
        : 0;
      if (requestedAt && ageMs > STALE_PENDING_MS) {
        console.warn(
          "[refresh-cancellation-status] stale pending >72h, resetting to none",
          { docId, requestedAt },
        );
        satStatus = "none";
      }
    } else if (prior === "none") {
      // M-8: el documento nunca se canceló y el PAC no reporta nada → NO
      // escribir un cancellation_status='pending' espurio (eso haría creer a
      // la UI que hay una cancelación en trámite que nunca se solicitó).
      return json({ success: true, cancellation_status: prior }, 200);
    }

    // N-27: para el REP el estado se persiste en rep_cancellation_status y
    // rep_cfdi_status sólo baja a 'cancelled' cuando el SAT confirma.
    const update: Record<string, unknown> = isPayment
      ? { rep_cancellation_status: satStatus }
      : { cancellation_status: satStatus };
    if (satStatus === "accepted") {
      if (isPayment) {
        update.rep_cfdi_status = "cancelled";
        update.rep_cancelled_at = new Date().toISOString();
      } else {
        update.cfdi_status = "cancelled";
        update.status = "cancelled";
        update.cancelled_at = new Date().toISOString();
      }
    }

    const updRes = await supabase.from(table).update(update).eq(
      "id",
      docId,
    );
    // M-8: verificar el error del UPDATE — antes un fallo silencioso dejaba
    // la BD desactualizada mientras la función respondía success.
    if ((updRes as { error: unknown }).error) {
      return json({ error: "Failed to update document" }, 500);
    }

    return json({ success: true, cancellation_status: satStatus }, 200);
  } catch (_err) {
    return jsonError(req, 500, "Internal server error");
  }
}
