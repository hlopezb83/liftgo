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

export type { SupabaseLike };
export type CancelRepDeps = StampCfdiDeps;

export const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const VALID_MOTIVES = new Set(["01", "02", "03", "04"]);

export async function handleCancelPaymentComplement(
  req: Request,
  deps: CancelRepDeps,
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

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

    const body = await req.json().catch(() => ({}));
    const { payment_id, motive } = body as {
      payment_id?: unknown;
      motive?: unknown;
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

    const { data: payment } = await supabase
      .from("payments").select("rep_facturapi_id, rep_cfdi_status").eq(
        "id",
        payment_id,
      ).single();
    if (!payment) return jsonError(req, 404, "Payment not found");
    const pay = payment as Record<string, unknown>;
    if (pay.rep_cfdi_status !== "stamped" || !pay.rep_facturapi_id) {
      return jsonError(req, 400, "El REP no está timbrado");
    }

    const { apiKey } = await getFacturapiConfig(supabase, deps.env);
    if (!apiKey) return jsonError(req, 400, "Facturapi key not configured");

    const client = createFacturapiClient(apiKey);
    try {
      await sdkCallWithTimeout((signal) =>
        cancelInvoiceWithSignal(
          client,
          pay.rep_facturapi_id as string,
          { motive: motiveCode },
          { signal },
        )
      );
    } catch (err) {
      if (isFacturapiTimeout(err)) {
        console.warn("[cancel-payment-complement] facturapi timeout", { payment_id });
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

    await supabase.from("payments")
      .update({
        rep_cfdi_status: "cancelled",
        rep_cancelled_at: new Date().toISOString(),
      })
      .eq("id", payment_id);

    return jsonResponse(req, { success: true });
  } catch (_err) {
    return jsonError(req, 500, "Internal server error");
  }
}
