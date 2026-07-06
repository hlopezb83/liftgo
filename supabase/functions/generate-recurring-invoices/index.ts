import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const TZ = "America/Monterrey";

function nowInMonterrey(): Date {
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

function dateOnlyToMty(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtMx(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function lastOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

type Forklift = {
  name?: string;
  model?: string;
  serial_number?: string | null;
  daily_rate?: number;
  weekly_rate?: number;
  monthly_rate?: number;
};

type PreviewLine = {
  bookingId: string;
  bookingCode: string | null;
  customerId: string | null;
  customerName: string | null;
  forkliftName: string | null;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  monthlyRate: number;
  eligible: boolean;
  reason?:
    | "already_invoiced"
    | "no_customer"
    | "no_monthly_rate"
    | "period_in_future";
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
};

type PlanItem = {
  bookingId: string;
  customerId: string;
  customerName: string | null;
  forkliftName: string | null;
  forkliftSerial: string | null;
  monthlyRate: number;
  billingStart: Date;
  billingEnd: Date;
  startStr: string;
  endStr: string;
};

// deno-lint-ignore no-explicit-any
async function buildPlan(supabase: any): Promise<{
  lines: PreviewLine[];
  items: PlanItem[];
}> {
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, customer_id, customer_name, start_date, last_billed_date, forklifts(name, monthly_rate, serial_number)",
    )
    .eq("recurring_billing", true)
    .eq("status", "confirmed");
  if (bErr) throw bErr;

  const nowMty = nowInMonterrey();
  const lines: PreviewLine[] = [];
  const items: PlanItem[] = [];

  for (const booking of bookings || []) {
    const forklift = (booking.forklifts as Forklift | null) ?? null;
    const monthlyRate = forklift?.monthly_rate || 0;

    // Auto-heal: si last_billed_date apunta a un período sin factura vinculada,
    // tratamos la reserva como nunca facturada.
    let effectiveLastBilled: string | null = booking.last_billed_date ?? null;
    if (effectiveLastBilled) {
      const { data: linkedInvoice } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, invoices!inner(billing_period_end)")
        .eq("booking_id", booking.id)
        .eq("invoices.billing_period_end", effectiveLastBilled)
        .limit(1)
        .maybeSingle();
      if (!linkedInvoice) effectiveLastBilled = null;
    }

    let billingStart: Date;
    if (effectiveLastBilled) {
      const lastBilled = dateOnlyToMty(effectiveLastBilled);
      billingStart = new Date(
        Date.UTC(lastBilled.getUTCFullYear(), lastBilled.getUTCMonth() + 1, 1),
      );
    } else {
      const startDate = dateOnlyToMty(booking.start_date);
      billingStart = firstOfMonth(startDate);
    }
    const billingEnd = lastOfMonth(billingStart);
    const startStr = toIsoDate(billingStart);
    const endStr = toIsoDate(billingEnd);
    const periodLabel = `${fmtMx(billingStart)} al ${fmtMx(billingEnd)}`;

    const baseLine: PreviewLine = {
      bookingId: booking.id,
      bookingCode: booking.booking_number ?? null,
      customerId: booking.customer_id ?? null,
      customerName: booking.customer_name ?? null,
      forkliftName: forklift?.name ?? null,
      periodStart: startStr,
      periodEnd: endStr,
      periodLabel,
      monthlyRate,
      eligible: true,
    };

    if (nowMty < billingStart) {
      lines.push({ ...baseLine, eligible: false, reason: "period_in_future" });
      continue;
    }
    if (!booking.customer_id) {
      lines.push({ ...baseLine, eligible: false, reason: "no_customer" });
      continue;
    }
    if (monthlyRate === 0) {
      lines.push({ ...baseLine, eligible: false, reason: "no_monthly_rate" });
      continue;
    }

    // Already invoiced check
    const { data: existing } = await supabase
      .from("invoice_bookings")
      .select(
        "invoice_id, invoices!inner(id, invoice_number, billing_period_start, billing_period_end)",
      )
      .eq("booking_id", booking.id)
      .eq("invoices.billing_period_start", startStr)
      .eq("invoices.billing_period_end", endStr)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const inv = existing.invoices as { id: string; invoice_number: string };
      lines.push({
        ...baseLine,
        eligible: false,
        reason: "already_invoiced",
        existingInvoiceId: inv.id,
        existingInvoiceNumber: inv.invoice_number,
      });
      continue;
    }

    lines.push(baseLine);
    items.push({
      bookingId: booking.id,
      customerId: booking.customer_id as string,
      customerName: booking.customer_name ?? null,
      forkliftName: forklift?.name ?? null,
      forkliftSerial: forklift?.serial_number ?? null,
      monthlyRate,
      billingStart,
      billingEnd,
      startStr,
      endStr,
    });
  }

  return { lines, items };
}

// deno-lint-ignore no-explicit-any
async function executePlan(supabase: any, items: PlanItem[]) {
  const created: Array<{
    bookingIds: string[];
    invoiceId: string;
    invoiceNumber: string | null;
  }> = [];
  const failed: Array<{ bookingIds: string[]; error: string }> = [];

  // Agrupar por (customer_id, período)
  const groups = new Map<string, PlanItem[]>();
  for (const item of items) {
    const key = `${item.customerId}|${item.startStr}|${item.endStr}`;
    const arr = groups.get(key) ?? [];
    arr.push(item);
    groups.set(key, arr);
  }

  for (const group of groups.values()) {
    const first = group[0];
    const bookingIds = group.map((i) => i.bookingId);

    try {
      // Re-check idempotencia (por si otro run corrió en paralelo)
      const { data: existingLink } = await supabase
        .from("invoice_bookings")
        .select(
          "invoice_id, invoices!inner(id, invoice_number, billing_period_start, billing_period_end)",
        )
        .in("booking_id", bookingIds)
        .eq("invoices.billing_period_start", first.startStr)
        .eq("invoices.billing_period_end", first.endStr)
        .limit(1)
        .maybeSingle();

      if (existingLink) {
        await supabase
          .from("bookings")
          .update({ last_billed_date: first.endStr })
          .in("id", bookingIds);
        continue;
      }

      const { data: customer } = await supabase
        .from("customers")
        .select(
          "rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi",
        )
        .eq("id", first.customerId)
        .maybeSingle();

      const lineItems = group.map((i) => ({
        description: `${i.forkliftName || "Montacargas"} — Renta mensual (${
          fmtMx(i.billingStart)
        } al ${fmtMx(i.billingEnd)})${i.forkliftSerial ? ` (Serie: ${i.forkliftSerial})` : ""}`,
        quantity: 1,
        unit_price: i.monthlyRate,
        total: i.monthlyRate,
      }));

      const subtotal = group.reduce((acc, i) => acc + i.monthlyRate, 0);
      const taxRate = 16;
      const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
      const total = Math.round((subtotal + taxAmount) * 100) / 100;

      const { data: invNum } = await supabase.rpc("next_draft_invoice_number");
      const isSingle = group.length === 1;

      const { data: insertedInvoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invNum || `FAC-AUTO-${Date.now()}`,
          booking_id: isSingle ? first.bookingId : null,
          customer_id: first.customerId,
          customer_name: first.customerName,
          line_items: lineItems,
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          status: "draft",
          due_date: first.endStr,
          billing_period_start: first.startStr,
          billing_period_end: first.endStr,
          receptor_rfc: customer?.rfc ?? null,
          receptor_razon_social: customer?.razon_social || customer?.name ||
            null,
          receptor_regimen_fiscal: customer?.regimen_fiscal ?? null,
          receptor_domicilio_fiscal_cp: customer?.domicilio_fiscal_cp ?? null,
          uso_cfdi: customer?.uso_cfdi ?? "G03",
          forma_pago: "99",
          metodo_pago: "PPD",
          moneda: "MXN",
          tipo_cambio: 1,
        })
        .select("id, invoice_number")
        .single();

      if (invErr) throw invErr;

      const invoiceId = insertedInvoice?.id as string;

      const { error: pivotErr } = await supabase
        .from("invoice_bookings")
        .insert(
          bookingIds.map((bId) => ({ invoice_id: invoiceId, booking_id: bId })),
        );

      if (pivotErr) {
        await supabase.from("invoices").delete().eq("id", invoiceId);
        throw pivotErr;
      }

      await supabase
        .from("bookings")
        .update({ last_billed_date: first.endStr })
        .in("id", bookingIds);

      created.push({
        bookingIds,
        invoiceId,
        invoiceNumber: insertedInvoice?.invoice_number ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push({ bookingIds, error: msg });
    }
  }

  return { created, failed };
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

    // Parse body (may be empty for legacy callers)
    let body: { preview?: boolean; bookingIds?: string[] } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { /* legacy no-body call */ }

    const { lines, items: allItems } = await buildPlan(supabase);

    // Build target period from lines (first eligible one; all eligible share month typically)
    const eligibleLines = lines.filter((l) => l.eligible);
    const periodMonth = eligibleLines[0]?.periodStart?.slice(0, 7) ?? null;

    if (body.preview) {
      return new Response(
        JSON.stringify({
          success: true,
          period: periodMonth,
          lines,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Execute mode: filter items by bookingIds if provided
    const targetItems = body.bookingIds && body.bookingIds.length > 0
      ? allItems.filter((i) => body.bookingIds!.includes(i.bookingId))
      : allItems;

    const { created, failed } = await executePlan(supabase, targetItems);
    const invoicesCreated = created.length;
    const bookingsBilled = created.reduce(
      (acc, c) => acc + c.bookingIds.length,
      0,
    );

    return new Response(
      JSON.stringify({
        success: true,
        invoicesCreated,
        bookingsBilled,
        created,
        failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[generate-recurring-invoices]", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
