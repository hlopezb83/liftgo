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
    const token = authHeader.replace("Bearer ", "");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "administrativo");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => null);
    const { credit_note_id, motive, substitution_uuid, cancellation_reason } = body ?? {};

    if (!isUUID(credit_note_id)) {
      return new Response(JSON.stringify({ error: "credit_note_id must be UUID" }), { status: 400, headers: jsonHeaders });
    }
    if (typeof motive !== "string" || !VALID_MOTIVES.has(motive)) {
      return new Response(JSON.stringify({ error: "motive must be 01-04" }), { status: 400, headers: jsonHeaders });
    }
    if (motive === "01" && !isUUID(substitution_uuid)) {
      return new Response(JSON.stringify({ error: "substitution_uuid requerido para motivo 01" }), { status: 400, headers: jsonHeaders });
    }
    if (cancellation_reason && !isNonEmptyString(cancellation_reason, 1000)) {
      return new Response(JSON.stringify({ error: "cancellation_reason too long" }), { status: 400, headers: jsonHeaders });
    }

    const { data: nc, error: ncErr } = await supabase
      .from("credit_notes")
      .select("cfdi_status, facturapi_invoice_id")
      .eq("id", credit_note_id)
      .single();
    if (ncErr || !nc) {
      return new Response(JSON.stringify({ error: "Credit note not found" }), { status: 404, headers: jsonHeaders });
    }
    if (nc.cfdi_status !== "stamped") {
      return new Response(JSON.stringify({ error: "Only stamped credit notes can be cancelled" }), { status: 400, headers: jsonHeaders });
    }

    const { data: company } = await supabase.from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    const { data: secrets } = await supabase.from("billing_secrets").select("facturapi_test_key, facturapi_live_key").limit(1).maybeSingle();
    const mode = (company?.facturapi_mode as string | undefined) || "test";
    const apiKey = mode === "live"
      ? ((secrets?.facturapi_live_key as string | null) || Deno.env.get("FACTURAPI_LIVE_KEY"))
      : ((secrets?.facturapi_test_key as string | null) || Deno.env.get("FACTURAPI_TEST_KEY"));

    let satStatus = "accepted";
    const isStub = !apiKey || !nc.facturapi_invoice_id;

    if (apiKey && nc.facturapi_invoice_id) {
      const params = new URLSearchParams({ motive });
      if (motive === "01" && substitution_uuid) params.set("substitution", substitution_uuid);
      const url = `${FACTURAPI_BASE}/invoices/${nc.facturapi_invoice_id}?${params.toString()}`;
      const cancelRes = await fetch(url, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (!cancelRes.ok) {
        const errBody = await cancelRes.text();
        return new Response(JSON.stringify({ error: `Facturapi cancel error: ${cancelRes.status}`, detail: errBody }), {
          status: 502, headers: jsonHeaders,
        });
      }
      const cancelJson = await cancelRes.json().catch(() => ({}));
      const raw = (cancelJson?.cancellation_status as string | undefined) ?? "accepted";
      satStatus = ["accepted", "pending", "rejected", "expired", "none"].includes(raw) ? raw : "pending";
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

    const { error: updErr } = await supabase.from("credit_notes").update(update).eq("id", credit_note_id);
    if (updErr) {
      return new Response(JSON.stringify({ error: "Failed to update credit note" }), { status: 500, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({
      success: true,
      stub: isStub,
      cancellation_status: satStatus,
      accepted: isAccepted,
    }), { headers: jsonHeaders });
  } catch (err) {
    console.error("cancel-credit-note error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
