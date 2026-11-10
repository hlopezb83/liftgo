import { computeProrate } from "./prorate.ts";
import {
  fmtMx,
  isBookingEnded,
  lastOfMonth,
  nextBillingPeriod,
  toIsoDate,
} from "./periods.ts";
import {
  futurePeriodLimit,
  type FuturePeriodOptions,
} from "./futurePeriods.ts";
import {
  type InvoicePeriods,
  mergedInvoicePeriods,
  periodCoverageFromIntervals,
} from "./invoiceHistory.ts";
import { pendingCanonicalPeriodsFromCoverage } from "./coverage.ts";
import { fiscalSnapshot, previewFingerprint } from "./planFingerprint.ts";
import type {
  PlanItem,
  PlanningContext,
  PreviewLine,
  RecurringPlan,
} from "./planTypes.ts";

/** Deterministic planner: no clock, database, network, or writes. */
export async function planRecurringInvoices(
  contexts: PlanningContext[],
  nowMty: Date,
  futureOptions: FuturePeriodOptions = {},
): Promise<RecurringPlan> {
  const planningLimit = futurePeriodLimit(futureOptions, nowMty);
  const lines: PreviewLine[] = [];
  const items: PlanItem[] = [];
  let truncated = false;
  let pendingCount = 0;
  for (
    const { booking, invoices, fiscal, quoteIssue, chargeSnapshot } of contexts
  ) {
    const forklift = booking.forklifts;
    // A1-1: moneda y tipo de cambio de la reserva (default MXN/1 si no hay dato).
    const bookingCurrency = String(booking.currency ?? "MXN").toUpperCase();
    const bookingTipoCambio = Number(booking.tipo_cambio ?? 1);
    // FIX-8 (ronda 3): regla canónica `fx_is_missing` — en divisa, un TC nulo,
    // ≤ 0 o exactamente 1 es "faltante". Antes el preview decía "elegible" con
    // TC=1 y la generación fallaba tarde con el error crudo del RPC.
    const hasValidExchangeRate = bookingCurrency === "MXN" ||
      (Number.isFinite(bookingTipoCambio) && bookingTipoCambio > 0 &&
        bookingTipoCambio !== 1);

    // B5-01: última actualización de la reserva, usada como proxy de "última
    // actualización de tarifa" (no existe historial de tarifas dedicado).
    const bookingUpdatedAt = booking.updated_at
      ? new Date(booking.updated_at as string)
      : null;

    // One lazy coverage union per booking; no work for out-of-scope dates.
    let coverageIntervals: InvoicePeriods | undefined;
    const getCoverage = () =>
      coverageIntervals === undefined
        ? (coverageIntervals = mergedInvoicePeriods(invoices))
        : coverageIntervals;
    const pending = pendingCanonicalPeriodsFromCoverage(
      booking.start_date,
      booking.end_date,
      planningLimit,
      getCoverage,
    );
    const coverageSnapshot = invoices.map((invoice) => ({
      id: invoice.id,
      start: invoice.billing_period_start,
      end: invoice.billing_period_end,
    })).sort((a, b) => a.id.localeCompare(b.id));
    let emitted = 0;
    // Invocation-local and lazy: no cached fiscal state survives a new plan.
    let fiscalFingerprint: string | undefined;
    for (const candidateStart of pending.starts) {
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
      const { billingStart, billingEnd, isProrated: proratedPeriod } =
        nextBillingPeriod(
          null,
          candidateStart,
          booking.end_date,
        );
      if (
        !Number.isFinite(billingStart.getTime()) ||
        !Number.isFinite(billingEnd.getTime())
      ) {
        throw new Error("La reserva contiene fechas de facturación inválidas");
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

      // B5-01: advertencia (no bloqueo) cuando la reserva se actualizó DESPUÉS
      // del fin de este periodo — la tarifa vigente pudo cambiar desde entonces
      // y el periodo atrasado se está facturando con la tarifa actual.
      const rateWarning = !!bookingUpdatedAt && bookingUpdatedAt > billingEnd;

      const baseLine: PreviewLine = {
        bookingId: booking.id,
        quoteId: booking.quote_id ?? undefined,
        organizationId: (booking.organization_id as string | null) ?? null,
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
          ? (fiscal?.tax_rate as number | null | undefined) ?? null
          : null,
        isProrated: proratedPeriod,
        proratedDays: proratedPeriod ? proratedDays : undefined,

        eligible: true,
        isFuture: billingStart > nowMty,
      };

      if (
        isBookingEnded(booking.end_date, billingStart) ||
        billingStart > planningLimit
      ) break;
      const coverage = periodCoverageFromIntervals(
        getCoverage(),
        startStr,
        endStr,
      );
      emitted++;
      if (coverage === "covered") continue;
      if (coverage !== "uncovered") {
        lines.push({ ...baseLine, eligible: false, reason: coverage });
        // Undated history makes every period ambiguous. A dated partial
        // overlap only blocks this month; disjoint months can still proceed.
        if (coverage === "legacy_period_review") break;
        continue;
      }
      if (!booking.customer_id) {
        lines.push({ ...baseLine, eligible: false, reason: "no_customer" });
        break;
      }
      // A1-1: reserva en moneda distinta a MXN sin tipo de cambio válido → no
      // facturar este periodo (ni los siguientes, ya que la moneda/TC son
      // atributos de la reserva, no del periodo). Se reporta explícitamente
      // en vez de facturar en MXN con TC=1 por default (bug crítico).
      if (quoteIssue) {
        lines.push({ ...baseLine, eligible: false, reason: quoteIssue });
        break;
      }
      if (!hasValidExchangeRate) {
        lines.push({
          ...baseLine,
          eligible: false,
          reason: "no_exchange_rate",
        });
        break;
      }
      // R4-32: sólo se omite cuando NO hay tarifa configurada (null en la
      // reserva y en la maestra). Una tarifa 0 pactada se factura por $0.
      if (configuredRate == null) {
        lines.push({ ...baseLine, eligible: false, reason: "no_monthly_rate" });
        break;
      }

      baseLine.previewFingerprint = await previewFingerprint({
        bookingId: booking.id,
        organizationId: booking.organization_id,
        customerId: booking.customer_id,
        customerName: booking.customer_name,
        forklift,
        coverage: coverageSnapshot,
        startStr,
        endStr,
        monthlyRate,
        billedAmount,
        currency: bookingCurrency,
        tipoCambio: bookingTipoCambio,
        fiscal: fiscal,
        quoteId: booking.quote_id ?? null,
        quote: booking.quotes ?? null,
        charges: chargeSnapshot,
        rateWarning,
      });
      lines.push(baseLine);
      if (
        futureOptions.includeFuturePeriods && fiscalFingerprint === undefined
      ) {
        fiscalFingerprint = await previewFingerprint(fiscalSnapshot(fiscal));
      }
      items.push({
        ...(futureOptions.includeFuturePeriods
          ? {
            fiscalFingerprint,
          }
          : {}),
        bookingId: booking.id,
        isFuture: billingStart > nowMty,
        organizationId: booking.organization_id as string,
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
        // FIX-6
        quoteId: (booking.quote_id as string | null) ?? null,
      });
    }
    if (emitted === pending.starts.length && pending.pendingCount > 0) {
      truncated = true;
      pendingCount += pending.pendingCount;
    }
  }

  return { lines, items, truncated, pendingCount };
}
