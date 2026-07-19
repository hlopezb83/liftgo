import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireRole } from "../_shared/auth.ts";
import { computeProrate } from "./prorate.ts";

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
  // BL-12: monto efectivo a facturar. Igual a monthlyRate salvo el primer
  // ciclo prorrateado (start_date a mitad de mes).
  billedAmount: number;
  isProrated: boolean;
  proratedDays?: number;
  eligible: boolean;
  reason?:
    | "already_invoiced"
    | "no_customer"
    | "no_monthly_rate"
    | "period_in_future"
    | "period_too_old"
    | "booking_ended";
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
  billedAmount: number;
  isProrated: boolean;
  proratedDays: number;
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
      "id, booking_number, customer_id, customer_name, start_date, end_date, last_billed_date, forklifts(name, monthly_rate, serial_number)",
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

    // Derivar last_billed_date desde el historial REAL de facturas vinculadas
    // (source of truth). Ignora bookings.last_billed_date cuando el historial lo
    // contradice — es la columna que se desincroniza (v6.110.0).
    //
    // Reglas:
    //  - Si existe al menos una factura no-cancelada con billing_period_end no
    //    nulo → usar MAX(billing_period_end).
    //  - Si sólo hay facturas legacy (billing_period_end = null) → conservar
    //    bookings.last_billed_date sin resetear (evita re-facturar meses viejos).
    //  - Si no hay facturas vinculadas → null (reserva nueva).
    let effectiveLastBilled: string | null = booking.last_billed_date ?? null;
    {
      const { data: linked } = await supabase
        .from("invoice_bookings")
        .select("invoices!inner(billing_period_end, status, cfdi_status)")
        .eq("booking_id", booking.id)
        .neq("invoices.status", "cancelled")
        .neq("invoices.cfdi_status", "cancelled");

      const rows = (linked ?? []) as Array<
        { invoices: { billing_period_end: string | null } }
      >;
      if (rows.length === 0) {
        effectiveLastBilled = null;
      } else {
        const periodEnds = rows
          .map((r) => r.invoices?.billing_period_end)
          .filter((v): v is string => !!v);
        if (periodEnds.length > 0) {
          periodEnds.sort();
          effectiveLastBilled = periodEnds[periodEnds.length - 1];
        }
        // else: sólo legacy → conservar booking.last_billed_date tal cual.
      }
    }

    let billingStart: Date;
    let isProrated = false;
    if (effectiveLastBilled) {
      const lastBilled = dateOnlyToMty(effectiveLastBilled);
      billingStart = new Date(
        Date.UTC(lastBilled.getUTCFullYear(), lastBilled.getUTCMonth() + 1, 1),
      );
    } else {
      // BL-12: primera factura de la suscripción. Si la reserva arranca a
      // mitad de mes, el primer periodo va del día de inicio al fin de mes y
      // se prorratea. Cobrar mes completo cuando sólo se rentaron 5 días es
      // injusto para el cliente.
      const startDate = dateOnlyToMty(booking.start_date);
      if (startDate.getUTCDate() === 1) {
        billingStart = firstOfMonth(startDate);
      } else {
        billingStart = startDate;
        isProrated = true;
      }
    }
    const billingEnd = lastOfMonth(billingStart);
    const startStr = toIsoDate(billingStart);
    const endStr = toIsoDate(billingEnd);
    const periodLabel = `${fmtMx(billingStart)} al ${fmtMx(billingEnd)}`;

    // BL-12: cálculo del monto prorrateado (helper puro para test).
    const prorate = computeProrate(
      isProrated ? billingStart.getUTCDate() : 1,
      billingEnd.getUTCDate(),
      monthlyRate,
    );
    const proratedDays = prorate.proratedDays;
    const billedAmount = prorate.billedAmount;

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
      billedAmount,
      isProrated,
      proratedDays: isProrated ? proratedDays : undefined,
      eligible: true,
    };

    // Fix D v7.90.0 (BL-13): si la reserva ya terminó (end_date < billingStart),
    // no facturar automáticamente. Recordatorio visual para que operaciones
    // complete la inspección de devolución.
    if (
      booking.end_date &&
      dateOnlyToMty(booking.end_date) < billingStart
    ) {
      lines.push({ ...baseLine, eligible: false, reason: "booking_ended" });
      continue;
    }
    if (nowMty < billingStart) {
      lines.push({ ...baseLine, eligible: false, reason: "period_in_future" });
      continue;
    }
    // Guarda de seguridad: si el periodo termina >1 mes antes del mes actual,
    // no facturar automáticamente — requiere revisión manual (v6.110.0).
    const currentMonthStart = firstOfMonth(nowMty);
    const oneMonthAgoEnd = new Date(
      Date.UTC(
        currentMonthStart.getUTCFullYear(),
        currentMonthStart.getUTCMonth(),
        0,
      ),
    );
    if (billingEnd < oneMonthAgoEnd) {
      lines.push({ ...baseLine, eligible: false, reason: "period_too_old" });
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
        "invoice_id, invoices!inner(id, invoice_number, billing_period_start, billing_period_end, status, cfdi_status)",
      )
      .eq("booking_id", booking.id)
      .eq("invoices.billing_period_start", startStr)
      .eq("invoices.billing_period_end", endStr)
      .neq("invoices.status", "cancelled")
      .neq("invoices.cfdi_status", "cancelled")
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
      billedAmount,
      isProrated,
      proratedDays,
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
          "invoice_id, invoices!inner(id, invoice_number, billing_period_start, billing_period_end, status, cfdi_status)",
        )
        .in("booking_id", bookingIds)
        .eq("invoices.billing_period_start", first.startStr)
        .eq("invoices.billing_period_end", first.endStr)
        .neq("invoices.status", "cancelled")
        .neq("invoices.cfdi_status", "cancelled")
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

      const lineItems = group.map((i) => {
        const proratedLabel = i.isProrated
          ? ` — prorrateado ${i.proratedDays} días`
          : "";
        return {
          description: `${i.forkliftName || "Montacargas"} — Renta mensual (${
            fmtMx(i.billingStart)
          } al ${fmtMx(i.billingEnd)}${proratedLabel})${
            i.forkliftSerial ? ` (Serie: ${i.forkliftSerial})` : ""
          }`,
          quantity: 1,
          unit_price: i.billedAmount,
          total: i.billedAmount,
        };
      });

      const subtotal = group.reduce((acc, i) => acc + i.billedAmount, 0);
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

  try {
    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const supabase = auth.adminClient;

    // Parse body (may be empty for legacy callers)
    let body: { preview?: boolean; bookingIds?: string[] } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { /* legacy no-body call */ }

    const { lines, items: allItems } = await buildPlan(supabase);

    const eligibleLines = lines.filter((l) => l.eligible);
    const periodMonth = eligibleLines[0]?.periodStart?.slice(0, 7) ?? null;

    if (body.preview) {
      return jsonResponse(req, { success: true, period: periodMonth, lines });
    }

    const targetItems = body.bookingIds && body.bookingIds.length > 0
      ? allItems.filter((i) => body.bookingIds!.includes(i.bookingId))
      : allItems;

    const { created, failed } = await executePlan(supabase, targetItems);
    const invoicesCreated = created.length;
    const bookingsBilled = created.reduce(
      (acc, c) => acc + c.bookingIds.length,
      0,
    );

    return jsonResponse(req, {
      success: true,
      invoicesCreated,
      bookingsBilled,
      created,
      failed,
    });
  } catch (err) {
    console.error("[generate-recurring-invoices]", err);
    return jsonError(req, 500, "Internal server error");
  }
});
