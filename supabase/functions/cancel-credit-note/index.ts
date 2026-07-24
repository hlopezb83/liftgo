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

const VALID_MOTIVES = new Set(["01", "02", "03", "04"]);

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // EC-A1: requireServiceOrRole = requireRole + bypass service_role JWT para
    // el consumer de cfdi_retry_queue (mismo patrón que stamp-cfdi).
    const auth = await requireServiceOrRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const supabase = auth.adminClient;

    const body = await req.json().catch(() => null);
    const { credit_note_id, motive, substitution_uuid, cancellation_reason } =
      body ?? {};

    if (!isUUID(credit_note_id)) {
      return jsonError(req, 400, "credit_note_id must be UUID");
    }
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
      .select("cfdi_status, facturapi_invoice_id")
      .eq("id", credit_note_id)
      .single();
    if (ncErr || !nc) return jsonError(req, 404, "Credit note not found");
    if (nc.cfdi_status !== "stamped") {
      return jsonError(req, 400, "Only stamped credit notes can be cancelled");
    }

    const { apiKey } = await getFacturapiConfig(
      supabase,
      (k) => Deno.env.get(k),
    );

    let satStatus = "accepted";
    const isStub = !apiKey || !nc.facturapi_invoice_id;

    if (apiKey && nc.facturapi_invoice_id) {
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
          return jsonResponse(req, {
            error: "PAC no respondió a tiempo, reintenta",
            code: "TIMEOUT",
            transient: true,
          }, { status: 504 });
        }
        const desc = describeFacturapiError(err);
        return jsonError(req, 502, `Facturapi cancel error: ${desc.status}`, {
          detail: desc.detail,
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
    console.error("cancel-credit-note error:", err);
    return jsonError(req, 500, "Internal server error");
  }
});
