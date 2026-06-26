// Pure handler for cancel-payment-complement, deps-injected for testability.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import type { StampCfdiDeps, SupabaseLike } from "../stamp-cfdi/handler.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  resolveFacturapiKey,
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
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401, jsonHeaders);
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
    if (!allowed) {
      return json({ error: "Forbidden" }, 403, jsonHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const { payment_id, motive } = body as {
      payment_id?: unknown;
      motive?: unknown;
    };
    if (!isUUID(payment_id)) {
      return json(
        { error: "payment_id must be a valid UUID" },
        400,
        jsonHeaders,
      );
    }
    const motiveCode = typeof motive === "string" && VALID_MOTIVES.has(motive)
      ? motive
      : "02";

    const { data: payment } = await supabase
      .from("payments").select("rep_facturapi_id, rep_cfdi_status").eq(
        "id",
        payment_id,
      ).single();
    if (!payment) {
      return json({ error: "Payment not found" }, 404, jsonHeaders);
    }
    const pay = payment as Record<string, unknown>;
    if (pay.rep_cfdi_status !== "stamped" || !pay.rep_facturapi_id) {
      return json({ error: "El REP no está timbrado" }, 400, jsonHeaders);
    }

    const { data: company } = await supabase
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets").select("facturapi_test_key, facturapi_live_key")
      .limit(1).maybeSingle();
    const co = (company ?? {}) as Record<string, unknown>;
    const sec = (secrets ?? {}) as Record<string, unknown>;
    const mode = (co.facturapi_mode as string | undefined) || "test";
    const apiKey = resolveFacturapiKey({
      mode: mode === "live" ? "live" : "test",
      dbTestKey: sec.facturapi_test_key as string | null | undefined,
      dbLiveKey: sec.facturapi_live_key as string | null | undefined,
      envTestKey: deps.env("FACTURAPI_TEST_KEY"),
      envLiveKey: deps.env("FACTURAPI_LIVE_KEY"),
    });
    if (!apiKey) {
      return json({ error: "Facturapi key not configured" }, 400, jsonHeaders);
    }

    const client = createFacturapiClient(apiKey);
    try {
      await client.invoices.cancel(
        pay.rep_facturapi_id as string,
        { motive: motiveCode },
      );
    } catch (err) {
      const desc = describeFacturapiError(err);
      return json(
        {
          error: `Facturapi cancel error: ${desc.status}`,
          detail: desc.detail,
        },
        502,
        jsonHeaders,
      );
    }

    await supabase.from("payments")
      .update({
        rep_cfdi_status: "cancelled",
        rep_cancelled_at: new Date().toISOString(),
      })
      .eq("id", payment_id);

    return json({ success: true }, 200, jsonHeaders);
  } catch (_err) {
    return json({ error: "Internal server error" }, 500, {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
    });
  }
}

function json(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
