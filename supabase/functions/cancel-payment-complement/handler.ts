// Pure handler for cancel-payment-complement, deps-injected for testability.
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { isUUID } from "../_shared/validate.ts";
import type { StampCfdiDeps, SupabaseLike } from "../stamp-cfdi/handler.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
} from "../_shared/facturapi/client.ts";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonError(req, 401, "Unauthorized");
    }
    const token = authHeader.replace("Bearer ", "");
    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return jsonError(req, 401, "Unauthorized");
    }
    const userId = claimsData.claims.sub;

    const supabase = deps.createServiceClient();
    const rolesRes = await supabase.from("user_roles").select("role").eq(
      "user_id",
      userId,
    );
    const roles = (rolesRes as { data: unknown }).data as
      | Array<{ role: string }>
      | null;
    const allowed = (roles ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) return jsonError(req, 403, "Forbidden");

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
      await client.invoices.cancel(
        pay.rep_facturapi_id as string,
        { motive: motiveCode },
      );
    } catch (err) {
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
