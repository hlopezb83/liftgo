import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireServiceOrRole } from "../_shared/auth.ts";
import { isNonEmptyString, isUUID } from "../_shared/validate.ts";
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
import type { SupabaseLike } from "../_shared/types.ts";

const VALID_MOTIVES = new Set(["01", "02", "03", "04"]);

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  // R4-01 (patrón cancel-cfdi): refs fuera del try para liberar el claim en
  // el catch cuando una excepción ocurre ANTES de contactar al PAC; si ya se
  // llamó al PAC, 'pending' es correcto hasta reconciliar vía refresh.
  let supabaseRef: SupabaseLike | null = null;
  let creditNoteIdRef: string | null = null;
  let claimed = false;
  let pacAttempted = false;
  const releaseClaimRef = async () => {
    if (!claimed || !supabaseRef || !creditNoteIdRef) return;
    claimed = false;
    await supabaseRef.from("credit_notes")
      .update({ cancellation_status: "none" })
      .eq("id", creditNoteIdRef)
      .eq("cancellation_status", "pending");
  };

  try {
    // EC-A1: requireServiceOrRole = requireRole + bypass service_role JWT para
    // el consumer de cfdi_retry_queue (mismo patrón que stamp-cfdi).
    const auth = await requireServiceOrRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const supabase = auth.adminClient;
    supabaseRef = supabase as unknown as SupabaseLike;

    const body = await req.json().catch(() => null);
    const { credit_note_id, motive, substitution_uuid, cancellation_reason } =
      body ?? {};

    if (!isUUID(credit_note_id)) {
      return jsonError(req, 400, "credit_note_id must be UUID");
    }
    creditNoteIdRef = credit_note_id as string;

    if (typeof motive !== "string" || !VALID_MOTIVES.has(motive)) {
      return jsonError(req, 400, "motive must be 01-04");
    }
    if (motive === "01" && !isUUID(substitution_uuid)) {
      return jsonError(req, 400, "substitution_uuid requerido para motivo 01");
    }
    if (cancellation_reason && !isNonEmptyString(cancellation_reason, 1000)) {
      return jsonError(req, 400, "cancellation_reason too long");
    }

    const { data: nc, error: ncErr } = await supabase
      .from("credit_notes")
      .select("cfdi_status, cancellation_status, facturapi_invoice_id")
      .eq("id", credit_note_id)
      .single();
    if (ncErr || !nc) return jsonError(req, 404, "Credit note not found");
    if (nc.cfdi_status !== "stamped") {
      return jsonError(req, 400, "Only stamped credit notes can be cancelled");
    }

    // N-28: claim atómico estilo cancel-cfdi (S2-2.4). Sólo la primera
    // petición concurrente cambia cancellation_status 'none' → 'pending' sobre
    // una NC timbrada; las demás reciben 409 en vez de mandar una segunda
    // cancelación al SAT.
    const { data: claim } = await supabase
      .from("credit_notes")
      .update({
        cancellation_status: "pending",
        // R4-14: timestamp dedicado de la solicitud (ver cancel-cfdi).
        cancellation_requested_at: new Date().toISOString(),
      })
      .eq("id", credit_note_id)
      .eq("cfdi_status", "stamped")
      .in("cancellation_status", ["none", "rejected", "expired"])
      .select("id")
      .maybeSingle();
    if (!claim) {
      return jsonError(
        req,
        409,
        // R4-02: 'rejected'/'expired' son reintentables (admite el claim).
        "Ya hay una cancelación en proceso para esta nota de crédito; si fue rechazada o expiró, puedes reintentarla",
      );
    }
    claimed = true;
    const releaseClaim = releaseClaimRef;

    const { apiKey, mode } = await getFacturapiConfig(
      supabase,
      (k) => Deno.env.get(k),
    );

    let satStatus = "accepted";
    const isStub = !apiKey || !nc.facturapi_invoice_id;

    if (isStub && mode === "live") {
      // N-28: liberar el claim — la cancelación NUNCA llegó al PAC.
      await releaseClaim();
      // M-2 (mismo guard C-2 que cancel-cfdi/handler.ts): en modo live NUNCA
      // marcamos "aceptada" una cancelación stub. Un stub en live significa
      // (a) API key faltante o (b) nota de crédito sin facturapi_invoice_id
      // (probablemente timbrada como stub en test y migrada a live).
      // Cancelarla fake dejaría el SAT y la BD divergentes.
      return jsonError(
        req,
        400,
        !apiKey
          ? "Facturapi API key no configurada para modo live. No se puede cancelar sin llamar al SAT."
          : "La nota de crédito no tiene facturapi_invoice_id (no fue timbrada realmente). No se puede cancelar en modo live.",
      );
    }

    if (apiKey && nc.facturapi_invoice_id) {
      pacAttempted = true;
      const client = createFacturapiClient(apiKey);
      const params: Record<string, string> = { motive };
      if (motive === "01" && substitution_uuid) {
        params.substitution = substitution_uuid;
      }
      try {
        const cancelJson = await sdkCallWithTimeout((signal) =>
          cancelInvoiceWithSignal(
            client,
            nc.facturapi_invoice_id as string,
            params,
            { signal },
          )
        );
        const raw = ((cancelJson as { cancellation_status?: string })
          ?.cancellation_status) ?? "accepted";
        satStatus =
          ["accepted", "pending", "rejected", "expired", "none"].includes(raw)
            ? raw
            : "pending";
      } catch (err) {
        if (isFacturapiTimeout(err)) {
          console.warn("[cancel-credit-note] facturapi timeout", {
            credit_note_id,
          });
          // R4-05: NO liberar el claim — la cancelación pudo llegar al SAT y
          // solo se perdió la respuesta; reintentar de inmediato arriesga una
          // doble cancelación. Se conserva 'pending' y el estado real se
          // resuelve vía refresh-cancellation-status (igual que cancel-cfdi).
          return jsonResponse(req, {
            error:
              "PAC no respondió a tiempo; consulta el estado con refresh-cancellation-status antes de reintentar",
            code: "TIMEOUT",
            transient: true,
          }, { status: 504 });
        }

        const desc = describeFacturapiError(err);
        // N-28: la cancelación no se confirmó ante el SAT — liberar el claim
        // para no bloquear el reintento (manual o vía cola).
        await releaseClaim();
        // B-1: encolar reintento solo si el error es transitorio (5xx / red /
        // 429) — la cancelación NO llegó al SAT, así que reintentar es seguro.
        // Mismo patrón que cancel-cfdi (BL-44); el consumer de la cola
        // (process-cfdi-retry-queue) reinvoca esta función con la operación
        // `cancel_nc`, mapeando invoice_id → credit_note_id y esparciendo el
        // payload plano.
        if (isTransientFacturapiError(desc)) {
          await enqueueCfdiRetry(supabase as unknown as SupabaseLike, {
            operation: "cancel_nc",
            invoiceId: credit_note_id,
            payload: {
              motive,
              ...(motive === "01" && substitution_uuid
                ? { substitution_uuid }
                : {}),
              ...(cancellation_reason ? { cancellation_reason } : {}),
            },
            errorMessage: `${desc.code ?? ""} ${desc.message}`.trim(),
          });
        }
        return jsonError(req, 502, `Facturapi cancel error: ${desc.status}`, {
          detail: desc.detail,
          transient: isTransientFacturapiError(desc),
        });
      }
    }

    const isAccepted = satStatus === "accepted";
    const update: Record<string, unknown> = {
      cancellation_status: satStatus,
      cancellation_motive: motive,
      substitution_uuid: motive === "01" ? substitution_uuid : null,
      cancellation_reason: cancellation_reason ?? null,
    };
    if (isAccepted) {
      update.cfdi_status = "cancelled";
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
    }

    const { error: updErr } = await supabase.from("credit_notes").update(update)
      .eq("id", credit_note_id);
    if (updErr) return jsonError(req, 500, "Failed to update credit note");

    return jsonResponse(req, {
      success: true,
      stub: isStub,
      cancellation_status: satStatus,
      accepted: isAccepted,
    });
  } catch (err) {
    // R4-01: solo liberamos el claim si nunca se contactó al PAC; si ya se
    // llamó, el estado 'pending' es correcto hasta reconciliar con el SAT.
    if (!pacAttempted) await releaseClaimRef();
    console.error("cancel-credit-note error:", err);

    return jsonError(req, 500, "Internal server error");
  }
});
