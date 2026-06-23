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
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  // Construimos fecha como UTC pero con los componentes de Monterrey,
  // de modo que getFullYear/getMonth/getDate (UTC) reflejen el calendario MTY.
  return new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    ),
  );
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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await callerClient.auth
      .getClaims(token);
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
      .select(
        "*, forklifts(name, model, daily_rate, weekly_rate, monthly_rate)",
      )
      .eq("recurring_billing", true)
      .eq("status", "confirmed");

    if (bErr) throw bErr;

    let invoicesCreated = 0;
    let bookingsBilled = 0;
    let duplicatesSkipped = 0;
    const nowMty = nowInMonterrey();

    type Forklift = {
      name?: string;
      model?: string;
      daily_rate?: number;
      weekly_rate?: number;
      monthly_rate?: number;
    };
    type Booking = (typeof bookings extends Array<infer T> ? T : never);
    type EligibleBooking = {
      booking: Booking;
      forklift: Forklift | null;
      monthlyRate: number;
      billingStart: Date;
      billingEnd: Date;
      startStr: string;
      endStr: string;
    };

    // 1) Calcular el período objetivo de cada reserva y filtrar las elegibles.
    const eligible: EligibleBooking[] = [];
    for (const booking of bookings || []) {
      let billingStart: Date;
      if (booking.last_billed_date) {
        const lastBilled = dateOnlyToMty(booking.last_billed_date);
        billingStart = new Date(
          Date.UTC(lastBilled.getUTCFullYear(), lastBilled.getUTCMonth() + 1, 1),
        );
      } else {
        const startDate = dateOnlyToMty(booking.start_date);
        billingStart = firstOfMonth(startDate);
      }
      const billingEnd = lastOfMonth(billingStart);
      if (nowMty < billingStart) continue;

      const forklift = (booking.forklifts as Forklift | null) ?? null;
      const monthlyRate = forklift?.monthly_rate || 0;
      if (monthlyRate === 0) continue;
      if (!booking.customer_id) continue;

      eligible.push({
        booking,
        forklift,
        monthlyRate,
        billingStart,
        billingEnd,
        startStr: toIsoDate(billingStart),
        endStr: toIsoDate(billingEnd),
      });
    }

    // 2) Agrupar por (customer_id, billingStart, billingEnd).
    const groups = new Map<string, EligibleBooking[]>();
    for (const item of eligible) {
      const key = `${item.booking.customer_id}|${item.startStr}|${item.endStr}`;
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }

    // 3) Procesar cada grupo: una sola factura con N conceptos + N pivote rows.
    for (const items of groups.values()) {
      const first = items[0];
      const customerId = first.booking.customer_id as string;
      const { startStr, endStr } = first;
      const bookingIds = items.map((i) => i.booking.id);

      // Idempotencia: ¿ya existe factura ligada a alguna de estas reservas en este período?
      const { data: existingLink } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, invoices!inner(id, billing_period_start, billing_period_end)")
        .in("booking_id", bookingIds)
        .eq("invoices.billing_period_start", startStr)
        .eq("invoices.billing_period_end", endStr)
        .limit(1)
        .maybeSingle();

      if (existingLink) {
        duplicatesSkipped++;
        await supabase
          .from("bookings")
          .update({ last_billed_date: endStr })
          .in("id", bookingIds);
        continue;
      }

      // Snapshot CFDI desde el cliente (una vez por grupo).
      const { data: customer } = await supabase
        .from("customers")
        .select(
          "rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi",
        )
        .eq("id", customerId)
        .maybeSingle();

      if (!customer?.rfc) {
        console.warn(
          `[recurring-invoices] Cliente ${customerId} sin RFC; factura se creará pero no podrá timbrarse hasta completar datos fiscales.`,
        );
      }

      const lineItems = items.map((i) => ({
        description: `${i.forklift?.name || "Montacargas"} — Renta mensual (${fmtMx(i.billingStart)} al ${fmtMx(i.billingEnd)})`,
        quantity: 1,
        unit_price: i.monthlyRate,
        total: i.monthlyRate,
      }));

      const subtotal = items.reduce((acc, i) => acc + i.monthlyRate, 0);
      const taxRate = 16;
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      const { data: invNum } = await supabase.rpc("next_invoice_number");

      const isSingle = items.length === 1;
      const { data: insertedInvoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invNum || `FAC-AUTO-${Date.now()}`,
          booking_id: isSingle ? first.booking.id : null,
          customer_id: customerId,
          customer_name: first.booking.customer_name,
          line_items: lineItems,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          status: "draft",
          due_date: endStr,
          billing_period_start: startStr,
          billing_period_end: endStr,
          receptor_rfc: customer?.rfc ?? null,
          receptor_razon_social: customer?.razon_social || customer?.name || null,
          receptor_regimen_fiscal: customer?.regimen_fiscal ?? null,
          receptor_domicilio_fiscal_cp: customer?.domicilio_fiscal_cp ?? null,
          uso_cfdi: customer?.uso_cfdi ?? "G03",
          forma_pago: "99",
          metodo_pago: "PPD",
          moneda: "MXN",
          tipo_cambio: 1,
        })
        .select("id")
        .single();

      if (invErr) {
        const code = (invErr as { code?: string }).code;
        if (code === "23505") {
          duplicatesSkipped++;
          continue;
        }
        throw invErr;
      }

      const invoiceId = insertedInvoice?.id as string;

      // Vincular todas las reservas vía pivote.
      const { error: pivotErr } = await supabase
        .from("invoice_bookings")
        .insert(
          bookingIds.map((bId) => ({ invoice_id: invoiceId, booking_id: bId })),
        );
      if (pivotErr) {
        console.error("[recurring-invoices] pivot insert error", pivotErr);
        throw pivotErr;
      }

      await supabase
        .from("bookings")
        .update({ last_billed_date: endStr })
        .in("id", bookingIds);

      invoicesCreated++;
      bookingsBilled += items.length;
      console.log(
        `[recurring-invoices] cliente=${customerId} período=${startStr}..${endStr} reservas=${items.length} factura=${invoiceId}`,
      );
    }

    return new Response(
      JSON.stringify({ success: true, invoicesCreated, bookingsBilled, duplicatesSkipped }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[generate-recurring-invoices]", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
