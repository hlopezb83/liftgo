// Pure handler for cancel-payment-complement, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import type { StampCfdiDeps, SupabaseLike } from "../stamp-cfdi/handler.ts";
import { authenticateWithDeps } from "../_shared/authWithDeps.ts";
import {
  cancelInvoiceWithSignal,
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
} from "../_shared/facturapi/client.ts";
import {
  isFacturapiTimeout,
  sdkCallWithTimeout,
} from "../_shared/facturapi/withTimeout.ts";
import {
  enqueueCfdiRetry,
  isTransientFacturapiError,
} from "../_shared/cfdiRetryQueue.ts";

export type { SupabaseLike };
export type CancelRepDeps = StampCfdiDeps;

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const VALID_MOTIVES = new Set(["01", "02", "03", "04"]);
// M-7: mismos estados SAT que cancel-cfdi/handler.ts.
const VALID_SAT_STATUSES = [
  "accepted",
  "pending",
  "rejected",
  "expired",
];

export async function handleCancelPaymentComplement(
  req: Request,
  deps: CancelRepDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  // R4-01 (patrón cancel-cfdi): refs fuera del try para liberar el claim en
  // el catch cuando una excepción ocurre ANTES de contactar al PAC; si ya se
  // llamó al PAC, 'pending' es correcto hasta reconciliar vía refresh.
  let supabaseRef: SupabaseLike | null = null;
  let paymentIdRef: string | null = null;
  let claimed = false;
  let pacAttempted = false;
  const releaseClaimRef = async () => {
    if (!claimed || !supabaseRef || !paymentIdRef) return;
    claimed = false;
    await supabaseRef.from("payments")
      .update({ rep_cancellation_status: "none" })
      .eq("id", paymentIdRef)
      .eq("rep_cancellation_status", "pending");
  };

  try {
    const auth = await authenticateWithDeps({
      req,
      createCallerClient: (h) => deps.createCallerClient(h),
      createServiceClient: () => deps.createServiceClient(),
      allowedRoles: ["admin", "administrativo"],
      logTag: "[cancel-payment-complement]",
    });
    if (!auth.ok) return jsonError(req, auth.status, auth.message);
    const supabase = auth.supabase;
    supabaseRef = supabase;


    const body = await req.json().catch(() => ({}));
    const { payment_id, motive, substitution_uuid, cancellation_reason } =
      body as {
        payment_id?: unknown;
        motive?: unknown;
        substitution_uuid?: unknown;
        cancellation_reason?: unknown;
      };

    if (!isUUID(payment_id)) {
      return jsonError(req, 400, "payment_id must be a valid UUID");
    }
    // Fix B v7.90.0: motivo es OBLIGATORIO y debe ser un código válido del SAT.
    // Antes se caía silenciosamente a "02", ocultando errores del cliente.
    if (typeof motive !== "string" || !VALID_MOTIVES.has(motive)) {
      return jsonError(req, 400, "motive must be one of 01,02,03,04");
    }
    const motiveCode = motive;
    // M-7: mismo guard que cancel-cfdi — motivo 01 ("comprobante emitido con
    // errores con relación") exige el UUID del CFDI sustituto; sin él el SAT
    // rechaza el trámite y el REP local queda en un estado ambiguo.
    if (motiveCode === "01" && !isUUID(substitution_uuid)) {
      return jsonError(
        req,
        400,
        "substitution_uuid (UUID de factura sustituta) es requerido para motivo 01",
      );
    }
    if (
      cancellation_reason !== undefined && cancellation_reason !== null &&
      (typeof cancellation_reason !== "string" ||
        cancellation_reason.length > 1000)
    ) {
      return jsonError(req, 400, "cancellation_reason too long");
    }

    // N-49: claim atómico pre-PAC — persiste motivo/sustitución/razón y marca
    // rep_cancellation_status='pending' en un solo UPDATE condicionado. Sólo
    // la primera petición concurrente pasa; las demás reciben 409 en vez de
    // mandar una segunda cancelación del REP al SAT.
    const { data: payment } = await supabase
      .from("payments")
      .update({
        rep_cancellation_status: "pending",
        rep_cancellation_motive: motiveCode,
        rep_substitution_uuid: motiveCode === "01" ? substitution_uuid : null,
        rep_cancellation_reason: typeof cancellation_reason === "string"
          ? cancellation_reason
          : null,
      })
      .eq("id", payment_id)
      .eq("rep_cfdi_status", "stamped")
      .eq("rep_cancellation_status", "none")
      .select("rep_facturapi_id, rep_cfdi_status")
      .maybeSingle();
    if (!payment) {
      const { data: existing } = await supabase
        .from("payments").select("id, rep_cfdi_status").eq("id", payment_id)
        .maybeSingle();
      if (!existing) return jsonError(req, 404, "Payment not found");
      if ((existing as Record<string, unknown>).rep_cfdi_status !== "stamped") {
        return jsonError(req, 400, "El REP no está timbrado");
      }
      return jsonError(req, 409, "Ya hay una cancelación del REP en proceso");
    }
    const pay = payment as Record<string, unknown>;
    if (!pay.rep_facturapi_id) {
      // N-49: sin referencia al PAC no hay nada que cancelar — liberar claim.
      await supabase.from("payments")
        .update({ rep_cancellation_status: "none" })
        .eq("id", payment_id);
      return jsonError(req, 400, "El REP no está timbrado");
    }

    // N-49: helper para liberar el claim cuando la cancelación NUNCA llegó al
    // SAT (config faltante, timeout o error del PAC). Si no se libera, un
    // reintento posterior chocaría con su propio 'pending'.
    const releaseClaim = async () => {
      await supabase.from("payments")
        .update({ rep_cancellation_status: "none" })
        .eq("id", payment_id)
        .eq("rep_cancellation_status", "pending");
    };

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    if (!apiKey) {
      await releaseClaim();
      return jsonError(req, 400, "Facturapi key not configured");
    }

    const client = createFacturapiClient(apiKey);
    let satStatus = "accepted";
    try {
      const params: Record<string, string> = { motive: motiveCode };
      if (motiveCode === "01" && substitution_uuid) {
        params.substitution = substitution_uuid as string;
      }
      const cancelJson = await sdkCallWithTimeout((signal) =>
        cancelInvoiceWithSignal(
          client,
          pay.rep_facturapi_id as string,
          params,
          { signal },
        )
      );
      // M-7: mapear la respuesta del PAC como cancel-cfdi — antes se ignoraba
      // cancellation_status y el REP quedaba 'cancelled' en la BD aunque el
      // SAT lo hubiera dejado pendiente/rechazado/expirado.
      const rawStatus = ((cancelJson as { cancellation_status?: string })
        ?.cancellation_status) ?? "accepted";
      satStatus = VALID_SAT_STATUSES.includes(rawStatus)
        ? rawStatus
        : "pending";
    } catch (err) {
      if (isFacturapiTimeout(err)) {
        console.warn("[cancel-payment-complement] facturapi timeout", {
          payment_id,
        });
        // N-49: la cancelación no se confirmó; liberar el claim para permitir
        // el reintento manual (el estado real se verifica con el refresh).
        await releaseClaim();
        return jsonResponse(req, {
          error: "PAC no respondió a tiempo, reintenta",
          code: "TIMEOUT",
          transient: true,
        }, { status: 504 });
      }
      const desc = describeFacturapiError(err);
      // BL-44: encolar reintento solo si el error es transitorio (5xx / red /
      // 429) — la cancelación NO llegó al SAT, así que reintentar es seguro.
      // Mismo patrón que cancel-cfdi / cancel-credit-note; el consumer de la
      // cola (process-cfdi-retry-queue) reinvoca esta función con la operación
      // `cancel_rep`, mapeando invoice_id → payment_id y esparciendo el payload.
      await releaseClaim();
      if (isTransientFacturapiError(desc)) {
        await enqueueCfdiRetry(supabase, {
          operation: "cancel_rep",
          invoiceId: payment_id as string,
          payload: {
            motive: motiveCode,
            ...(motiveCode === "01" && substitution_uuid
              ? { substitution_uuid }
              : {}),
          },
          errorMessage: `${desc.code ?? ""} ${desc.message}`.trim(),
        });
      }
      return jsonError(req, 502, `Facturapi cancel error: ${desc.status}`, {
        detail: desc.detail,
        transient: isTransientFacturapiError(desc),
      });
    }

    // M-7: solo marcar cancelled cuando el SAT aceptó la cancelación. Con
    // pending/rejected/expired el REP sigue vigente (stamped) — el admin
    // puede refrescar el estado después (mismo criterio que cancel-cfdi).
    const isAccepted = satStatus === "accepted";
    // N-49: el estado del SAT siempre se persiste (pending se conserva para
    // que el refresh lo pueda consultar después).
    const updRes = await supabase.from("payments")
      .update({
        rep_cancellation_status: satStatus,
        ...(isAccepted
          ? {
            rep_cfdi_status: "cancelled",
            rep_cancelled_at: new Date().toISOString(),
          }
          : {}),
      })
      .eq("id", payment_id);
    // M-7: verificar el error del UPDATE — antes un fallo silencioso dejaba
    // el REP cancelado en el SAT pero 'stamped' en la BD, divergencia
    // imposible de detectar desde la app.
    if ((updRes as { error: unknown }).error) {
      return jsonError(req, 500, "Failed to update payment");
    }

    return jsonResponse(req, {
      success: true,
      cancellation_status: satStatus,
      accepted: isAccepted,
      warning: !isAccepted
        ? "El SAT marcó la cancelación como pendiente. El receptor tiene 72 horas para aceptar o rechazar."
        : undefined,
    });
  } catch (_err) {
    return jsonError(req, 500, "Internal server error");
  }
}
