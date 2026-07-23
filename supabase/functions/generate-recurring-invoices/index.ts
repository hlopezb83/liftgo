import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
// R-arq DIFF 1: requireServiceOrRole permite que el cron invoque con
// service_role (o CRON_SECRET vía guardia futura) sin JWT de usuario; los
// admins siguen pudiendo dispararla desde la UI.
import { requireServiceOrRole } from "../_shared/auth.ts";
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
    | "booking_ended";
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
};

// Tope duro del loop de catch-up: 24 iteraciones = 2 años. Blindaje contra
// bugs de datos (last_billed corrompido, end_date muy lejano) que podrían
// intentar generar cientos de facturas en una sola corrida.
const MAX_CATCHUP_ITERATIONS = 24;

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
      "id, booking_number, customer_id, customer_name, start_date, end_date, last_billed_date, monthly_rate, forklifts(name, monthly_rate, serial_number)",
    )
    .eq("recurring_billing", true)
    .eq("status", "confirmed");
  if (bErr) throw bErr;

  const nowMty = nowInMonterrey();
  const lines: PreviewLine[] = [];
  const items: PlanItem[] = [];

  for (const booking of bookings || []) {
    const forklift = (booking.forklifts as Forklift | null) ?? null;
    // BL-31 (v7.92.0): preferir tarifa pactada en la reserva; fallback a la maestra.
    const monthlyRate = Number(booking.monthly_rate) ||
      forklift?.monthly_rate || 0;

    // Derivar last_billed_date desde el historial REAL de facturas vinculadas
    // (source of truth). Ignora bookings.last_billed_date cuando el historial lo
    // contradice — es la columna que se desincroniza (v6.110.0).
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

    // Catch-up loop (v7.138.0): iterar mes por mes desde el siguiente periodo
    // no facturado hasta alcanzar el mes actual. Antes sólo se generaba el
    // primer periodo faltante y, si quedaba >1 mes atrasado, la guarda
    // period_too_old lo silenciaba para siempre. Ahora recuperamos meses
    // omitidos (cron caído, reserva pausada, migración) hasta MAX iteraciones.
    let virtualLastBilled: string | null = effectiveLastBilled;
    let firstIteration = true;

    for (let iter = 0; iter < MAX_CATCHUP_ITERATIONS; iter++) {
      let billingStart: Date;
      let isProrated = false;
      if (virtualLastBilled) {
        const lastBilled = dateOnlyToMty(virtualLastBilled);
        billingStart = new Date(
          Date.UTC(
            lastBilled.getUTCFullYear(),
            lastBilled.getUTCMonth() + 1,
            1,
          ),
        );
      } else {
        // BL-12: primera factura de la suscripción. Si arranca a mitad de mes,
        // se prorratea. Sólo aplica en la primera iteración (no hay historial).
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

      // Guarda booking_ended (BL-13): reserva devuelta antes del periodo.
      if (
        booking.end_date &&
        dateOnlyToMty(booking.end_date) < billingStart
      ) {
        // Sólo reportamos booking_ended en la primera iteración; en catch-up,
        // llegar al fin del contrato es la terminación natural del loop.
        if (firstIteration) {
          lines.push({ ...baseLine, eligible: false, reason: "booking_ended" });
        }
        break;
      }
      // Periodo aún no llega → detener catch-up. Sólo reportamos la línea si
      // es la primera iteración (para que el operador vea la reserva en el
      // preview y sepa cuándo tocará facturar).
      if (nowMty < billingStart) {
        if (firstIteration) {
          lines.push({
            ...baseLine,
            eligible: false,
            reason: "period_in_future",
          });
        }
        break;
      }
      if (!booking.customer_id) {
        lines.push({ ...baseLine, eligible: false, reason: "no_customer" });
        break;
      }
      if (monthlyRate === 0) {
        lines.push({ ...baseLine, eligible: false, reason: "no_monthly_rate" });
        break;
      }

      // Ya facturado en BD → registrar línea informativa y avanzar el cursor
      // virtual para intentar el siguiente periodo en la próxima iteración.
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
        virtualLastBilled = endStr;
        firstIteration = false;
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
      virtualLastBilled = endStr;
      firstIteration = false;
    }
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

      // BL-B5 (Ola 2.2): RPC atómico — invoice + pivot + last_billed_date
      // en una sola transacción con advisory lock por reserva. Evita facturas
      // huérfanas si falla el pivot y previene duplicados en corridas paralelas.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc(
        "create_recurring_invoice",
        {
          p_booking_ids: bookingIds,
          p_customer_id: first.customerId,
          p_customer_name: first.customerName,
          p_line_items: lineItems,
          p_subtotal: subtotal,
          p_tax_rate: taxRate,
          p_tax_amount: taxAmount,
          p_total: total,
          p_billing_period_start: first.startStr,
          p_billing_period_end: first.endStr,
          p_receptor_rfc: customer?.rfc ?? null,
          p_receptor_razon_social: customer?.razon_social || customer?.name ||
            null,
          p_receptor_regimen_fiscal: customer?.regimen_fiscal ?? null,
          p_receptor_domicilio_fiscal_cp: customer?.domicilio_fiscal_cp ?? null,
          p_uso_cfdi: customer?.uso_cfdi ?? "G03",
        },
      );

      if (rpcErr) {
        // 23505 = unique_violation → duplicado del índice único parcial.
        // Otra corrida en paralelo ya facturó este período; no es error.
        if (rpcErr.code === "23505") {
          console.log(
            `[generate-recurring-invoices] already_billed bookings=${
              bookingIds.join(",")
            } period=${first.startStr}..${first.endStr}`,
          );
          continue;
        }
        throw rpcErr;
      }

      const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!row?.invoice_id) throw new Error("RPC returned no invoice_id");

      created.push({
        bookingIds,
        invoiceId: row.invoice_id as string,
        invoiceNumber: (row.invoice_number as string) ?? null,
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
    const auth = await requireServiceOrRole(req, ["admin", "administrativo"]);
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
