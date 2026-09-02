import { requireServiceOrRole } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeProrate } from "./prorate.ts";
import { selectTargetItems } from "./selection.ts";
import {
  fromCents,
  resolveVatRatePercent,
  sumLineTaxCents,
  sumMoneyCents,
} from "../_shared/money.ts";

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
  // M-13: tasa de IVA del cliente (porcentaje 0–100). La vista previa la usa
  // para totalizar igual que la generación real (frontera 8%, exento 0%).
  taxRate?: number | null;
  isProrated: boolean;
  proratedDays?: number;
  eligible: boolean;
  reason?:
    | "already_invoiced"
    | "no_customer"
    | "no_monthly_rate"
    | "period_in_future"
    | "booking_ended"
    | "no_exchange_rate";
  // A1-1: bandera para exponer al operador que la reserva no es MXN.
  currency?: string;
  // B5-01: la tarifa pudo cambiar después de este período (booking.updated_at
  // posterior al fin del período facturado) — advertencia, no bloqueo.
  rateWarning?: boolean;
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
  // A1-1: moneda/tipo de cambio de la reserva, propagados al RPC.
  currency: string;
  tipoCambio: number;
  // B5-01: advertencia de tarifa potencialmente desactualizada para el periodo.
  rateWarning: boolean;
};

// deno-lint-ignore no-explicit-any
async function buildPlan(supabase: any): Promise<{
  lines: PreviewLine[];
  items: PlanItem[];
  truncated: boolean;
  pendingCount: number;
}> {
  const { data: bookings, error: bErr } = await supabase
    .from("bookings")
    .select(
      "id, booking_number, customer_id, customer_name, start_date, end_date, last_billed_date, monthly_rate, currency, tipo_cambio, updated_at, forklifts(name, monthly_rate, serial_number)",
    )
    .eq("recurring_billing", true)
    .eq("status", "confirmed");
  if (bErr) throw bErr;

  // M-13: precargar la tasa de IVA de cada cliente para exponerla en el preview.
  const customerIds = Array.from(
    new Set(
      ((bookings || []) as Array<{ customer_id: string | null }>)
        .map((b) => b.customer_id)
        .filter((id): id is string => !!id),
    ),
  );
  const taxRateByCustomer = new Map<string, number | null>();
  if (customerIds.length > 0) {
    const { data: custRows } = await supabase
      .from("customers")
      .select("id, tax_rate")
      .in("id", customerIds);
    for (
      const c of (custRows ?? []) as Array<
        { id: string; tax_rate: number | null }
      >
    ) {
      taxRateByCustomer.set(c.id, c.tax_rate);
    }
  }

  const nowMty = nowInMonterrey();
  const lines: PreviewLine[] = [];
  const items: PlanItem[] = [];
  let truncated = false;
  let pendingCount = 0;

  for (const booking of bookings || []) {
    const forklift = (booking.forklifts as Forklift | null) ?? null;

    // A1-1: moneda y tipo de cambio de la reserva (default MXN/1 si no hay dato).
    const bookingCurrency = String(booking.currency ?? "MXN").toUpperCase();
    const bookingTipoCambio = Number(booking.tipo_cambio ?? 1);
    const hasValidExchangeRate = bookingCurrency === "MXN" ||
      (Number.isFinite(bookingTipoCambio) && bookingTipoCambio > 0);

    // B5-01: última actualización de la reserva, usada como proxy de "última
    // actualización de tarifa" (no existe historial de tarifas dedicado).
    const bookingUpdatedAt = booking.updated_at
      ? new Date(booking.updated_at as string)
      : null;

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

    let exitedNaturally = false;
    for (let iter = 0; iter < MAX_CATCHUP_ITERATIONS; iter++) {
      // B5-01: la tarifa se recalcula EN CADA iteración del catch-up (antes se
      // calculaba una sola vez fuera del loop y todos los periodos atrasados
      // se facturaban a la tarifa vigente al momento de correr el cron).
      // BL-31 (v7.92.0): preferir tarifa pactada en la reserva; fallback a la
      // maestra. N-7c/R4-32: nullish, no `||` — una tarifa pactada de 0 es un
      // dato válido (cortesía/canje) y NO debe confundirse con "sin tarifa
      // configurada". configuredRate = null sólo cuando ni la reserva ni la
      // maestra tienen valor.
      const configuredRate = booking.monthly_rate != null
        ? Number(booking.monthly_rate)
        : (forklift?.monthly_rate != null
          ? Number(forklift.monthly_rate)
          : null);
      const monthlyRate = configuredRate ?? 0;
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
      let billingEnd = lastOfMonth(billingStart);
      // N-7a: si el contrato termina dentro del periodo, facturar sólo hasta
      // end_date y prorratear el último ciclo simétricamente al primero (BL-12).
      let isEndProrated = false;
      if (booking.end_date) {
        const contractEnd = dateOnlyToMty(booking.end_date);
        if (contractEnd >= billingStart && contractEnd < billingEnd) {
          billingEnd = contractEnd;
          isEndProrated = true;
        }
      }
      const startStr = toIsoDate(billingStart);
      const endStr = toIsoDate(billingEnd);
      const periodLabel = `${fmtMx(billingStart)} al ${fmtMx(billingEnd)}`;

      const daysInMonth = lastOfMonth(billingStart).getUTCDate();
      const billedDays = billingEnd.getUTCDate() - billingStart.getUTCDate() +
        1;
      // Prorrateo simétrico: computeProrate(startDay) factura
      // (daysInMonth - startDay + 1) días; invirtiendo, startDay =
      // daysInMonth - billedDays + 1 cubre el primer ciclo, el último y el mes
      // completo con la misma fórmula.
      const prorate = computeProrate(
        daysInMonth - billedDays + 1,
        daysInMonth,
        monthlyRate,
      );
      const proratedDays = prorate.proratedDays;
      const billedAmount = prorate.billedAmount;
      const proratedPeriod = isProrated || isEndProrated;

      // B5-01: advertencia (no bloqueo) cuando la reserva se actualizó DESPUÉS
      // del fin de este periodo — la tarifa vigente pudo cambiar desde entonces
      // y el periodo atrasado se está facturando con la tarifa actual.
      const rateWarning = !!bookingUpdatedAt && bookingUpdatedAt > billingEnd;

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
        currency: bookingCurrency,
        rateWarning,
        taxRate: booking.customer_id
          ? taxRateByCustomer.get(booking.customer_id) ?? null
          : null,
        isProrated: proratedPeriod,
        proratedDays: proratedPeriod ? proratedDays : undefined,

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
        exitedNaturally = true;
        break;
      }
      // Periodo aún no llega → detener catch-up. Sólo reportamos la línea si
      // es la primera iteración (para que el operador vea la reserva en el
      // preview y sepa cuándo tocará facturar).
      if (nowMty < billingStart) {
        if (firstIteration) {
          // BUG-SEP1: cuando el mes EN CURSO ya quedó facturado, el cursor
          // salta al mes siguiente y el operador sólo veía "Período futuro"
          // (octubre) sin explicación. Reportamos también el periodo del mes
          // en curso como `already_invoiced`, con su factura, para que quede
          // claro que ya existe y no falta nada por generar.
          const currentMonthStart = firstOfMonth(nowMty);
          if (
            virtualLastBilled &&
            dateOnlyToMty(virtualLastBilled) >= currentMonthStart
          ) {
            const prevEndStr = virtualLastBilled;
            const prevStartStr = toIsoDate(currentMonthStart);
            const { data: prevInvoice } = await supabase
              .from("invoice_bookings")
              .select(
                "invoice_id, invoices!inner(id, invoice_number, billing_period_start, billing_period_end, status, cfdi_status)",
              )
              .eq("booking_id", booking.id)
              .eq("invoices.billing_period_start", prevStartStr)
              .eq("invoices.billing_period_end", prevEndStr)
              .neq("invoices.status", "cancelled")
              .neq("invoices.cfdi_status", "cancelled")
              .limit(1)
              .maybeSingle();
            if (prevInvoice) {
              const inv = prevInvoice.invoices as {
                id: string;
                invoice_number: string;
              };
              lines.push({
                ...baseLine,
                periodStart: prevStartStr,
                periodEnd: prevEndStr,
                periodLabel: `${fmtMx(currentMonthStart)} al ${
                  fmtMx(dateOnlyToMty(prevEndStr))
                }`,
                eligible: false,
                reason: "already_invoiced",
                existingInvoiceId: inv.id,
                existingInvoiceNumber: inv.invoice_number,
              });
            }
          }
          lines.push({
            ...baseLine,
            eligible: false,
            reason: "period_in_future",
          });
        }
        exitedNaturally = true;
        break;
      }

      if (!booking.customer_id) {
        lines.push({ ...baseLine, eligible: false, reason: "no_customer" });
        exitedNaturally = true;
        break;
      }
      // A1-1: reserva en moneda distinta a MXN sin tipo de cambio válido → no
      // facturar este periodo (ni los siguientes, ya que la moneda/TC son
      // atributos de la reserva, no del periodo). Se reporta explícitamente
      // en vez de facturar en MXN con TC=1 por default (bug crítico).
      if (!hasValidExchangeRate) {
        lines.push({
          ...baseLine,
          eligible: false,
          reason: "no_exchange_rate",
        });
        exitedNaturally = true;
        break;
      }
      // R4-32: sólo se omite cuando NO hay tarifa configurada (null en la
      // reserva y en la maestra). Una tarifa 0 pactada se factura por $0.
      if (configuredRate == null) {
        lines.push({ ...baseLine, eligible: false, reason: "no_monthly_rate" });
        exitedNaturally = true;
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
        // FIX R4-31: propagar el prorrateo del período (primer O último
        // ciclo), no solo el flag local de primer ciclo, para que la
        // descripción de la factura refleje el prorrateo como el preview.
        isProrated: proratedPeriod,
        proratedDays: proratedPeriod ? proratedDays : 0,
        billingStart,
        billingEnd,
        startStr,
        endStr,
        // A1-1
        currency: bookingCurrency,
        tipoCambio: bookingCurrency === "MXN" ? 1 : bookingTipoCambio,
        // B5-01
        rateWarning,
      });
      virtualLastBilled = endStr;
      firstIteration = false;
    }
    if (!exitedNaturally && virtualLastBilled) {
      const last = dateOnlyToMty(virtualLastBilled);
      const next = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1));
      const contractEnd = booking.end_date ? dateOnlyToMty(booking.end_date) : nowMty;
      const limit = contractEnd < nowMty ? contractEnd : nowMty;
      if (next <= limit) {
        const remaining = Math.max(1,
          (limit.getUTCFullYear() - next.getUTCFullYear()) * 12 +
          limit.getUTCMonth() - next.getUTCMonth() + 1,
        );
        truncated = true;
        pendingCount += remaining;
        console.warn(JSON.stringify({
          event: "recurring_catchup_truncated",
          truncated: true,
          bookingId: booking.id,
          pendingCount: remaining,
        }));
      }
    }
  }

  return { lines, items, truncated, pendingCount };
}

async function executePlan(
  supabase: SupabaseClient,
  items: PlanItem[],
  allowStaleRate = false,
) {
  const created: Array<{
    bookingIds: string[];
    invoiceId: string;
    invoiceNumber: string | null;
  }> = [];
  const failed: Array<{ bookingIds: string[]; error: string }> = [];
  // R6-F5: fail-closed. Un periodo cuya reserva se actualizó DESPUÉS del fin
  // del periodo pudo cambiar de tarifa; no se factura salvo confirmación
  // explícita del operador (allowStaleRate). El cron nunca la envía.
  const skippedStaleRate: Array<
    { bookingIds: string[]; periodStart: string; periodEnd: string }
  > = [];
  // B5-01: periodos catch-up facturados con tarifa posiblemente desactualizada
  // (sólo cuando el operador confirmó explícitamente).
  const rateWarnings: Array<
    { bookingIds: string[]; periodStart: string; periodEnd: string }
  > = [];

  if (!allowStaleRate) {
    const stale = items.filter((i) => i.rateWarning);
    for (const i of stale) {
      skippedStaleRate.push({
        bookingIds: [i.bookingId],
        periodStart: i.startStr,
        periodEnd: i.endStr,
      });
    }
    items = items.filter((i) => !i.rateWarning);
  }

  // Agrupar por (customer_id, período)
  const groups = new Map<string, PlanItem[]>();
  for (const item of items) {
    // Residual (c): la llave debe incluir moneda y tipo de cambio; agrupar
    // reservas MXN y USD del mismo cliente/periodo emitía una sola factura con
    // la moneda de la primera reserva y montos de otra divisa sumados 1:1.
    const key =
      `${item.customerId}|${item.startStr}|${item.endStr}|${item.currency}|${item.tipoCambio}`;
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
          "rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi, tax_rate",
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

      // M23: tasa por cliente (frontera 8%, exento 0%) en vez de 16 fijo,
      // y aritmética en centavos enteros (_shared/money.ts) en vez de floats
      // con Math.round — elimina el drift de centavos acumulado por período.
      const subtotalCents = sumMoneyCents(group.map((i) => i.billedAmount));
      // R9-14: `resolveVatRatePercent` distingue "sin dato" (null/undefined/NaN
      // -> DEFAULT_VAT_RATE_PERCENT) de "0% explícito" (se respeta). Antes
      // `Number(customer?.tax_rate)` convertía null en 0 y generaba IVA 0%
      // inesperado cuando el cliente no tenía tasa capturada.
      const taxRate = resolveVatRatePercent(customer?.tax_rate);
      // A1-B2: IVA línea por línea (mismo criterio que computeTotals y que
      // Facturapi al timbrar). Redondear una sola vez sobre el subtotal
      // agregado generaba varianzas de centavos que dejaban la factura
      // recurrente en cfdi_status='error' (BL-A5).
      const taxAmountCents = sumLineTaxCents(
        group.map((i) => i.billedAmount),
        taxRate,
      );

      const subtotal = fromCents(subtotalCents);
      const taxAmount = fromCents(taxAmountCents);
      const total = fromCents(subtotalCents + taxAmountCents);

      if (group.some((i) => i.rateWarning)) {
        rateWarnings.push({
          bookingIds,
          periodStart: first.startStr,
          periodEnd: first.endStr,
        });
      }

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
          // Residual (b): sin default "G03"; el uso de CFDI debe venir del
          // cliente (la RPC rechaza el periodo si falta y se reporta el error).
          p_uso_cfdi: customer?.uso_cfdi ?? null,
          // A1-1: moneda/tipo de cambio de la reserva. NOTA PARA MIGRACIÓN:
          // el RPC `create_recurring_invoice` todavía NO declara
          // `p_moneda`/`p_tipo_cambio` — hay que agregarlos con defaults
          // 'MXN'/1 y usarlos en el INSERT de `invoices` en vez de los
          // literales fijos 'MXN', 1 actuales. Mientras la migración no se
          // aplique, Postgres ignorará/rechazará estos parámetros extra.
          p_moneda: first.currency,
          p_tipo_cambio: first.tipoCambio,
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

  return { created, failed, rateWarnings, skippedStaleRate };
}

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // Lote C · DIFF 8 rest: auth timing-safe compartida para cron/service.
    const cronAuth = await authenticateCronRequest(req);
    let supabase;
    if (cronAuth.ok) {
      supabase = getAdminClient();
    } else {
      const auth = await requireServiceOrRole(req, ["admin", "administrativo"]);
      if (!auth.ok) return auth.response;
      supabase = auth.adminClient;
    }

    // Parse body (may be empty for legacy callers)
    let body: {
      preview?: boolean;
      bookingIds?: string[];
      // R9-18: selección explícita reserva + periodo desde el asistente.
      selections?: Array<{ bookingId?: string; periodStart?: string }>;
      allowStaleRate?: boolean;
    } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch { /* legacy no-body call */ }

    // POLÍTICA (v7.412.0): la facturación recurrente NUNCA se genera sola.
    // Armar los borradores es una decisión del operador (puede juntar o
    // separar reservas en una misma factura), así que el cron sólo puede
    // consultar; cualquier intento de generar desde el cron es no-op.
    if (cronAuth.ok && !body.preview) {
      console.log(
        "[generate-recurring-invoices] cron generation disabled (manual-only policy)",
      );
      return jsonResponse(req, {
        success: true,
        skipped: "automatic_generation_disabled",
        invoicesCreated: 0,
        bookingsBilled: 0,
        created: [],
        failed: [],
        rateWarnings: [],
        skippedStaleRate: [],
      });
    }

    const { lines, items: allItems, truncated, pendingCount } = await buildPlan(supabase);

    const eligibleLines = lines.filter((l) => l.eligible);
    const periodMonth = eligibleLines[0]?.periodStart?.slice(0, 7) ?? null;

    if (body.preview) {
      return jsonResponse(req, {
        success: true, period: periodMonth, lines, truncated,
        pending_count: pendingCount,
      });
    }

    // R9-18 (fix fail-open): decisión centralizada en `selection.ts`. Si el
    // caller envió `selections` (aunque venga vacío o con entradas
    // incompletas) se procesan EXCLUSIVAMENTE esas combinaciones.
    // Sin selector explícito no se escribe nada (fail-closed).
    const targetItems = selectTargetItems(allItems, body);
    if (targetItems === null) {
      return jsonResponse(req, {
        success: false,
        error: "Se requiere una selección explícita",
      }, { status: 400 });
    }

    // R6-F5: sólo un operador autenticado (no el cron) puede confirmar
    // facturar periodos cuya tarifa pudo cambiar después del periodo.
    const allowStaleRate = !cronAuth.ok && body.allowStaleRate === true;

    const { created, failed, rateWarnings, skippedStaleRate } =
      await executePlan(
        supabase,
        targetItems,
        allowStaleRate,
      );
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
      // B5-01: periodos catch-up facturados con posible tarifa desactualizada.
      rateWarnings,
      // R6-F5: periodos NO facturados por tarifa potencialmente desactualizada.
      skippedStaleRate,
      truncated,
      pending_count: pendingCount,
    });
  } catch (err) {
    console.error("[generate-recurring-invoices]", err);
    return jsonError(req, 500, "Internal server error");
  }
});
