import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorize: admin or administrativo only
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || !["admin", "administrativo"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find bookings with recurring billing enabled and confirmed status
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("*, forklifts(name, model, daily_rate, weekly_rate, monthly_rate)")
      .eq("recurring_billing", true)
      .eq("status", "confirmed");

    if (bErr) throw bErr;

    const fmtDate = (d: Date) => {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    let invoicesCreated = 0;

    for (const booking of bookings || []) {
      const lastBilled = booking.last_billed_date ? new Date(booking.last_billed_date) : new Date(booking.start_date);
      const now = new Date();

      // Calcular el mes a facturar: el mes siguiente a lastBilled
      const billingStart = new Date(lastBilled.getFullYear(), lastBilled.getMonth() + 1, 1);
      // Último día de ese mes
      const billingEnd = new Date(billingStart.getFullYear(), billingStart.getMonth() + 1, 0);

      // Solo generar si ya estamos en o después del mes a facturar
      if (now < billingStart) continue;

      const forklift = booking.forklifts as { name?: string; model?: string; daily_rate?: number; weekly_rate?: number; monthly_rate?: number } | null;
      const monthlyRate = forklift?.monthly_rate || 0;
      if (monthlyRate === 0) continue;

      const { data: invNum } = await supabase.rpc("next_invoice_number");

      const endStr = billingEnd.toISOString().split("T")[0];

      const lineItems = [{
        description: `${forklift?.name || "Montacargas"} — Renta mensual (${fmtDate(billingStart)} al ${fmtDate(billingEnd)})`,
        quantity: 1,
        unit_price: monthlyRate,
        total: monthlyRate,
      }];

      const taxRate = 16;
      const taxAmount = Math.round(monthlyRate * (taxRate / 100) * 100) / 100;
      const total = Math.round((monthlyRate + taxAmount) * 100) / 100;

      const { error: invErr } = await supabase.from("invoices").insert({
        invoice_number: invNum || `FAC-AUTO-${Date.now()}`,
        booking_id: booking.id,
        customer_id: booking.customer_id,
        customer_name: booking.customer_name,
        line_items: lineItems,
        subtotal: monthlyRate,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        status: "draft",
        due_date: endStr,
      });

      if (!invErr) {
        await supabase.from("bookings").update({ last_billed_date: endStr }).eq("id", booking.id);
        invoicesCreated++;
      }
    }

    return new Response(JSON.stringify({ success: true, invoicesCreated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
