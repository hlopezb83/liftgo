// Pure handler for refresh-cancellation-status, deps-injected for testability.
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";
import type { SupabaseLike } from "../_shared/types.ts";
import {
  createFacturapiClient,
  describeFacturapiError,
  resolveFacturapiKey,
} from "../_shared/facturapi/client.ts";

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
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const callerClient = deps.createCallerClient(authHeader);
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
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
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const { invoice_id } = (await req.json().catch(() => ({}))) as {
      invoice_id?: unknown;
    };
    if (!isUUID(invoice_id)) {
      return json({ error: "invoice_id must be a valid UUID" }, 400);
    }

    const { data: invoice } = await supabase
      .from("invoices")
      .select("facturapi_invoice_id, cancellation_status")
      .eq("id", invoice_id as string)
      .single();
    const inv = invoice as Record<string, unknown> | null;
    if (!inv?.facturapi_invoice_id) {
      return json({ error: "Invoice has no Facturapi reference" }, 404);
    }

    const { data: company } = await supabase
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets")
      .select("facturapi_test_key, facturapi_live_key").limit(1).maybeSingle();

    const co = (company ?? {}) as Record<string, unknown>;
    const sec = (secrets ?? {}) as Record<string, unknown>;
    const mode = (co.facturapi_mode as string) || "test";
    const apiKey = resolveFacturapiKey({
      mode: mode === "live" ? "live" : "test",
      dbTestKey: sec.facturapi_test_key as string | null | undefined,
      dbLiveKey: sec.facturapi_live_key as string | null | undefined,
      envTestKey: deps.env("FACTURAPI_TEST_KEY"),
      envLiveKey: deps.env("FACTURAPI_LIVE_KEY"),
    });
    if (!apiKey) return json({ error: "Facturapi key not configured" }, 400);

    const fid = inv.facturapi_invoice_id as string;
    const client = createFacturapiClient(apiKey);
    let facturApiInv: Record<string, unknown> = {};
    try {
      // updateStatus pide a Facturapi que refresque el estatus en el SAT.
      // La respuesta puede ser vacía, así que después hacemos retrieve para
      // obtener la factura con el `cancellation_status` actualizado.
      // deno-lint-ignore no-explicit-any
      const inv = client.invoices as any;
      if (typeof inv.updateStatus === "function") {
        try {
          const updated = await inv.updateStatus(fid);
          if (updated && typeof updated === "object") {
            facturApiInv = updated as Record<string, unknown>;
          }
        } catch (_e) {
          // Si updateStatus falla (404 SAT, etc.) seguimos con retrieve.
        }
      }
      if (!facturApiInv.cancellation_status) {
        facturApiInv = await client.invoices.retrieve(fid) as Record<
          string,
          unknown
        >;
      }
    } catch (err) {
      const desc = describeFacturapiError(err);
      return json(
        {
          error: `Facturapi status error: ${desc.status}`,
          detail: desc.detail,
        },
        502,
      );
    }
    const rawStatus =
      (facturApiInv?.cancellation_status as string | undefined) ??
        (inv.cancellation_status as string | undefined) ?? "pending";
    const satStatus = VALID_SAT_STATUSES.includes(rawStatus)
      ? rawStatus
      : "pending";

    const update: Record<string, unknown> = { cancellation_status: satStatus };
    if (satStatus === "accepted") {
      update.cfdi_status = "cancelled";
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
    }
    await supabase.from("invoices").update(update).eq(
      "id",
      invoice_id as string,
    );

    return json({ success: true, cancellation_status: satStatus }, 200);
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
}
