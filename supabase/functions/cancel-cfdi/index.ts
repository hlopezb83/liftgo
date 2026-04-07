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

    // Read facturapi_mode to select the right key
    const { data: company } = await supabase
      .from("company_settings")
      .select("facturapi_mode")
      .limit(1)
      .maybeSingle();

    const mode = (company as Record<string, unknown>)?.facturapi_mode as string || "test";
    const apiKey = mode === "live"
      ? Deno.env.get("FACTURAPI_LIVE_KEY")
      : Deno.env.get("FACTURAPI_TEST_KEY");
    const facturApiId = invoice.facturapi_invoice_id;

    // If we have a real Facturapi ID and API key, cancel via API
    if (apiKey && facturApiId) {
      // Map cancellation reason to SAT motive code
      // "02" = Comprobantes emitidos con errores con relación (most common)
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

      await cancelRes.text(); // consume body
    }

    // Update DB regardless (stub or real)
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
