import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const TZ = "America/Monterrey";

/** "now" en zona Monterrey como Date interpretado como wall-clock local. */
function nowInMonterrey(): Date {
  // Intl en es-MX con timeZone=America/Monterrey nos da la "wall clock" allá.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // Construimos fecha como UTC pero con los componentes de Monterrey,
  // de modo que getFullYear/getMonth/getDate (UTC) reflejen el calendario MTY.
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

/** Parsea YYYY-MM-DD como medianoche en Monterrey (sin desfase). */
function dateOnlyToMty(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formato YYYY-MM-DD a partir de un Date "wall clock" (UTC components). */
function toIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Formato DD/MM/YYYY (local MX). */
function fmtMx(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Primer día del mes (UTC components, representando wall-clock MTY). */
function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Último día del mes (UTC components, representando wall-clock MTY). */
function lastOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

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

    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("*, forklifts(name, model, daily_rate, weekly_rate, monthly_rate)")
      .eq("recurring_billing", true)
      .eq("status", "confirmed");

    if (bErr) throw bErr;

    let invoicesCreated = 0;
    let duplicatesSkipped = 0;
    const nowMty = nowInMonterrey();

    for (const booking of bookings || []) {
      let billingStart: Date;

      if (booking.last_billed_date) {
        // Mes siguiente al último facturado (calculado en wall-clock Monterrey).
        const lastBilled = dateOnlyToMty(booking.last_billed_date);
        billingStart = new Date(Date.UTC(lastBilled.getUTCFullYear(), lastBilled.getUTCMonth() + 1, 1));
      } else {
        const startDate = dateOnlyToMty(booking.start_date);
        billingStart = firstOfMonth(startDate);
      }

      const billingEnd = lastOfMonth(billingStart);

      // Solo si ya estamos en o después del mes a facturar (en MTY).
      if (nowMty < billingStart) continue;

      const forklift = booking.forklifts as
        | { name?: string; model?: string; daily_rate?: number; weekly_rate?: number; monthly_rate?: number }
        | null;
      const monthlyRate = forklift?.monthly_rate || 0;
      if (monthlyRate === 0) continue;

      const startStr = toIsoDate(billingStart);
      const endStr = toIsoDate(billingEnd);

      // Idempotencia explícita: verifica antes de pedir folio para no consumirlos.
      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("booking_id", booking.id)
        .eq("billing_period_start", startStr)
        .eq("billing_period_end", endStr)
        .maybeSingle();

      if (existing) {
        duplicatesSkipped++;
        // Mantén last_billed_date sincronizado por si quedó atrás.
        if (booking.last_billed_date !== endStr) {
          await supabase.from("bookings").update({ last_billed_date: endStr }).eq("id", booking.id);
        }
        continue;
      }

      const { data: invNum } = await supabase.rpc("next_invoice_number");

      const lineItems = [{
        description: `${forklift?.name || "Montacargas"} — Renta mensual (${fmtMx(billingStart)} al ${fmtMx(billingEnd)})`,
        quantity: 1,
        unit_price: monthlyRate,
        total: monthlyRate,
      }];

      const taxRate = 16;
      const taxAmount = Math.round(monthlyRate * (taxRate / 100) * 100) / 100;
      const total = Math.round((monthlyRate + taxAmount) * 100) / 100;

      // Snapshot CFDI 4.0: hidrata datos fiscales del receptor desde el cliente
      const { data: customer } = await supabase
        .from("customers")
        .select("rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi")
        .eq("id", booking.customer_id)
        .maybeSingle();

      if (!customer?.rfc) {
        console.warn(`[recurring-invoices] Cliente ${booking.customer_id} sin RFC; factura se creará pero no podrá timbrarse hasta completar datos fiscales.`);
      }

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
        billing_period_start: startStr,
        billing_period_end: endStr,
        // Snapshot fiscal del receptor (solo si el cliente los trae)
        receptor_rfc: customer?.rfc ?? null,
        receptor_razon_social: customer?.razon_social || customer?.name || null,
        receptor_regimen_fiscal: customer?.regimen_fiscal ?? null,
        receptor_domicilio_fiscal_cp: customer?.domicilio_fiscal_cp ?? null,
        uso_cfdi: customer?.uso_cfdi ?? "G03",
        // Defaults SAT para renta recurrente (PPD = pago en parcialidades / diferido)
        forma_pago: "99",
        metodo_pago: "PPD",
        moneda: "MXN",
        tipo_cambio: 1,
      });

      if (invErr) {
        // 23505 = unique_violation. Defensa final del índice único.
        const code = (invErr as { code?: string }).code;
        if (code === "23505") {
          duplicatesSkipped++;
          continue;
        }
        throw invErr;
      }

      await supabase.from("bookings").update({ last_billed_date: endStr }).eq("id", booking.id);
      invoicesCreated++;
    }

    return new Response(JSON.stringify({ success: true, invoicesCreated, duplicatesSkipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[generate-recurring-invoices]", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
