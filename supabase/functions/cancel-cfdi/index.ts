import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID, isNonEmptyString } from "../_shared/validate.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    // --- AuthN: require valid JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    // --- AuthZ: must be admin or administrativo ---
    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (rolesRows ?? []).some((r) => r.role === "admin" || r.role === "administrativo");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: jsonHeaders,
      });
    }

    const body = await req.json();
    const { invoice_id, cancellation_reason } = body;

    if (!isUUID(invoice_id)) {
      return new Response(
        JSON.stringify({ error: "invoice_id must be a valid UUID" }),
        { status: 400, headers: jsonHeaders }
      );
    }
    if (!isNonEmptyString(cancellation_reason, 1000)) {
      return new Response(
        JSON.stringify({ error: "cancellation_reason is required (max 1000 chars)" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("cfdi_status, total, facturapi_invoice_id")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404, headers: jsonHeaders,
      });
    }

    if (invoice.cfdi_status !== "stamped") {
      return new Response(
        JSON.stringify({ error: "Only stamped invoices can be cancelled" }),
        { status: 400, headers: jsonHeaders }
      );
    }

    // Read company settings for API key
    const { data: company } = await supabase
      .from("company_settings")
      .select("facturapi_mode, facturapi_test_key, facturapi_live_key")
      .limit(1)
      .maybeSingle();

    const mode = (company as Record<string, unknown>)?.facturapi_mode as string || "test";
    const dbTestKey = (company as Record<string, unknown>)?.facturapi_test_key as string | null;
    const dbLiveKey = (company as Record<string, unknown>)?.facturapi_live_key as string | null;
    const apiKey = mode === "live"
      ? (dbLiveKey || Deno.env.get("FACTURAPI_LIVE_KEY"))
      : (dbTestKey || Deno.env.get("FACTURAPI_TEST_KEY"));
    const facturApiId = invoice.facturapi_invoice_id;

    // If we have a real Facturapi ID and API key, cancel via API
    if (apiKey && facturApiId) {
      const cancelRes = await fetch(`${FACTURAPI_BASE}/invoices/${facturApiId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ motive: "02" }),
      });

      if (!cancelRes.ok) {
        const errBody = await cancelRes.text();
        console.error("Facturapi cancel error:", errBody);
        return new Response(
          JSON.stringify({ error: `Facturapi cancel error: ${cancelRes.status}`, detail: errBody }),
          { status: 502, headers: jsonHeaders }
        );
      }

      await cancelRes.text();
    }

    // Update DB
    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        cfdi_status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason,
        status: "cancelled",
      })
      .eq("id", invoice_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to cancel invoice" }), {
        status: 500, headers: jsonHeaders,
      });
    }

    const isStub = !apiKey || !facturApiId;

    return new Response(
      JSON.stringify({
        success: true,
        stub: isStub,
        warning: Number(invoice.total) > 1000
          ? "Facturas mayores a $1,000 MXN requieren aprobación del receptor para cancelación ante el SAT"
          : undefined,
      }),
      { headers: jsonHeaders }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
