import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID, isNonEmptyString } from "../_shared/validate.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const VALID_MOTIVES = new Set(["01", "02", "03", "04"]);

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (rolesRows ?? []).some((r) => r.role === "admin" || r.role === "administrativo");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json();
    const { invoice_id, motive, substitution_uuid, cancellation_reason } = body ?? {};

    if (!isUUID(invoice_id)) {
      return new Response(JSON.stringify({ error: "invoice_id must be a valid UUID" }), { status: 400, headers: jsonHeaders });
    }
    if (typeof motive !== "string" || !VALID_MOTIVES.has(motive)) {
      return new Response(JSON.stringify({ error: "motive must be one of 01,02,03,04" }), { status: 400, headers: jsonHeaders });
    }
    if (motive === "01" && !isUUID(substitution_uuid)) {
      return new Response(JSON.stringify({ error: "substitution_uuid (UUID de factura sustituta) es requerido para motivo 01" }), { status: 400, headers: jsonHeaders });
    }
    if (cancellation_reason && !isNonEmptyString(cancellation_reason, 1000)) {
      return new Response(JSON.stringify({ error: "cancellation_reason too long" }), { status: 400, headers: jsonHeaders });
    }

    const supabase = adminClient;

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("cfdi_status, total, facturapi_invoice_id, is_e2e")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers: jsonHeaders });
    }
    if ((invoice as Record<string, unknown>).is_e2e === true) {
      return new Response(JSON.stringify({ error: "E2E invoices cannot be cancelled at SAT" }), { status: 403, headers: jsonHeaders });
    }
    if (invoice.cfdi_status !== "stamped") {
      return new Response(JSON.stringify({ error: "Only stamped invoices can be cancelled" }), { status: 400, headers: jsonHeaders });
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
      ? ((secrets?.facturapi_live_key as string | null) || Deno.env.get("FACTURAPI_LIVE_KEY"))
      : ((secrets?.facturapi_test_key as string | null) || Deno.env.get("FACTURAPI_TEST_KEY"));
    const facturApiId = invoice.facturapi_invoice_id;

    let satStatus: string = "accepted"; // default when stub
    let isStub = !apiKey || !facturApiId;

    if (apiKey && facturApiId) {
      const params = new URLSearchParams({ motive });
      if (motive === "01" && substitution_uuid) params.set("substitution", substitution_uuid);
      const url = `${FACTURAPI_BASE}/invoices/${facturApiId}?${params.toString()}`;
      const cancelRes = await fetch(url, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${apiKey}` },
      });

      if (!cancelRes.ok) {
        const errBody = await cancelRes.text();
        console.error("Facturapi cancel error:", errBody);
        return new Response(
          JSON.stringify({ error: `Facturapi cancel error: ${cancelRes.status}`, detail: errBody }),
          { status: 502, headers: jsonHeaders },
        );
      }

      const cancelJson = await cancelRes.json().catch(() => ({}));
      // Facturapi returns: { status: "canceled"|"valid", cancellation_status: "accepted"|"pending"|... }
      const rawStatus = (cancelJson?.cancellation_status as string | undefined) ?? "accepted";
      satStatus = ["accepted", "pending", "rejected", "expired", "none"].includes(rawStatus) ? rawStatus : "pending";
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

    const { error: updateErr } = await supabase
      .from("invoices")
      .update(update)
      .eq("id", invoice_id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: "Failed to update invoice" }), { status: 500, headers: jsonHeaders });
    }

    return new Response(
      JSON.stringify({
        success: true,
        stub: isStub,
        cancellation_status: satStatus,
        accepted: isAccepted,
        warning: !isAccepted
          ? "El SAT marcó la cancelación como pendiente. El receptor tiene 72 horas para aceptar o rechazar."
          : undefined,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("cancel-cfdi error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
