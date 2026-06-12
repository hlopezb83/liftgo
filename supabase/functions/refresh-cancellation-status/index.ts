import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (rolesRows ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const { invoice_id } = await req.json().catch(() => ({}));
    if (!isUUID(invoice_id)) {
      return new Response(
        JSON.stringify({ error: "invoice_id must be a valid UUID" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { data: invoice } = await supabase
      .from("invoices")
      .select("facturapi_invoice_id, cancellation_status")
      .eq("id", invoice_id)
      .single();
    if (!invoice?.facturapi_invoice_id) {
      return new Response(
        JSON.stringify({ error: "Invoice has no Facturapi reference" }),
        { status: 404, headers: jsonHeaders },
      );
    }

    const { data: company } = await supabase
      .from("company_settings")
      .select("facturapi_mode")
      .limit(1)
      .maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets")
      .select("facturapi_test_key, facturapi_live_key")
      .limit(1)
      .maybeSingle();

    const mode = (company?.facturapi_mode as string | undefined) || "test";
    const apiKey = mode === "live"
      ? ((secrets?.facturapi_live_key as string | null) ||
        Deno.env.get("FACTURAPI_LIVE_KEY"))
      : ((secrets?.facturapi_test_key as string | null) ||
        Deno.env.get("FACTURAPI_TEST_KEY"));

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Facturapi key not configured" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Force Facturapi to re-query SAT
    const updateRes = await fetch(
      `${FACTURAPI_BASE}/invoices/${invoice.facturapi_invoice_id}/status`,
      {
        method: "PUT",
        headers: { "Authorization": `Bearer ${apiKey}` },
      },
    );
    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      console.error("Facturapi status update error:", errBody);
      return new Response(
        JSON.stringify({
          error: `Facturapi status error: ${updateRes.status}`,
          detail: errBody,
        }),
        {
          status: 502,
          headers: jsonHeaders,
        },
      );
    }

    // Then fetch the invoice
    const invRes = await fetch(
      `${FACTURAPI_BASE}/invoices/${invoice.facturapi_invoice_id}`,
      {
        headers: { "Authorization": `Bearer ${apiKey}` },
      },
    );
    const facturApiInv = await invRes.json().catch(() => ({}));
    const rawStatus =
      (facturApiInv?.cancellation_status as string | undefined) ??
        invoice.cancellation_status ?? "pending";
    const satStatus =
      ["accepted", "pending", "rejected", "expired", "none"].includes(rawStatus)
        ? rawStatus
        : "pending";

    const update: Record<string, unknown> = { cancellation_status: satStatus };
    if (satStatus === "accepted") {
      update.cfdi_status = "cancelled";
      update.status = "cancelled";
      update.cancelled_at = new Date().toISOString();
    }

    await supabase.from("invoices").update(update).eq("id", invoice_id);

    return new Response(
      JSON.stringify({ success: true, cancellation_status: satStatus }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("refresh-cancellation-status error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
