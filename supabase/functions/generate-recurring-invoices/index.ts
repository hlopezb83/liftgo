import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find bookings with recurring billing enabled and confirmed status
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("*, forklifts(name, model, daily_rate, weekly_rate, monthly_rate)")
      .eq("recurring_billing", true)
      .eq("status", "confirmed");

    if (bErr) throw bErr;

    let invoicesCreated = 0;

    for (const booking of bookings || []) {
      const lastBilled = booking.last_billed_date ? new Date(booking.last_billed_date) : new Date(booking.start_date);
      const now = new Date();
      const daysSinceLastBill = Math.floor((now.getTime() - lastBilled.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceLastBill < 30) continue;

      const forklift = booking.forklifts as { name?: string; model?: string; daily_rate?: number; weekly_rate?: number; monthly_rate?: number } | null;
      const monthlyRate = forklift?.monthly_rate || 0;
      if (monthlyRate === 0) continue;

      const { data: invNum } = await supabase.rpc("next_invoice_number");

      const billingEndDate = new Date(lastBilled);
      billingEndDate.setDate(billingEndDate.getDate() + 30);
      const endStr = billingEndDate.toISOString().split("T")[0];
      const startStr = lastBilled.toISOString().split("T")[0];

      const lineItems = [{
        description: `${forklift?.name || "Forklift"} — Monthly rental (${startStr} to ${endStr})`,
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
