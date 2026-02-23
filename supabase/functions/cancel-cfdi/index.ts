import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID, isNonEmptyString } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { invoice_id, cancellation_reason } = body;

    if (!isUUID(invoice_id)) {
      return new Response(
        JSON.stringify({ error: "invoice_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!isNonEmptyString(cancellation_reason, 1000)) {
      return new Response(
        JSON.stringify({ error: "cancellation_reason is required (max 1000 chars)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("cfdi_status, total")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invoice.cfdi_status !== "stamped") {
      return new Response(
        JSON.stringify({ error: "Only stamped invoices can be cancelled" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        stub: true,
        warning: Number(invoice.total) > 1000
          ? "Facturas mayores a $1,000 MXN requieren aprobación del receptor para cancelación ante el SAT"
          : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
