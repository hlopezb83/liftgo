import { assertNoLegacyVat } from "../_shared/legacyVat.ts";
import { requireServiceOrRole } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import {
  recurringChargeAmounts,
  recurringQuoteCharges,
} from "./quoteCharges.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import { resolveCallerOrganization } from "../_shared/orgContext.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.118.0";
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
import { periodCoverage } from "./invoiceHistory.ts";
import { pendingCanonicalPeriods } from "./coverage.ts";
import { groupPlanItems } from "./grouping.ts";
import { selectTargetItems } from "./selection.ts";
import { recurringQuoteIssue } from "./quoteDiscountGuard.ts";
import {
  type HistoricalInvoice,
  mergeLiveInvoiceHistory,
} from "./invoiceHistory.ts";
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
  // Fase 1 multiempresa: organización dueña de la reserva (nunca del payload).
  organizationId: string | null;
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
  isFuture?: boolean;
  previewFingerprint?: string;
  reason?:
    | "period_overlap_review"
    | "legacy_period_review"
    | "already_invoiced"
    | "no_customer"
    | "no_monthly_rate"
    | "period_in_future"
    | "booking_ended"
    | "no_exchange_rate"
    | "quote_discount_review"
    | "quote_source_missing"
    | "quote_charge_review";
  // A1-1: bandera para exponer al operador que la reserva no es MXN.
  currency?: string;
  // B5-01: la tarifa pudo cambiar después de este período (booking.updated_at
  // posterior al fin del período facturado) — advertencia, no bloqueo.
  rateWarning?: boolean;
  existingInvoiceId?: string;
  existingInvoiceNumber?: string;
  quoteId?: string;
};

export type PlanItem = {
  fiscalFingerprint?: string;
  isFuture?: boolean;
  bookingId: string;
  // Fase 1 multiempresa: organización de la reserva de origen; se hereda
  // explícitamente en la agrupación y en la factura resultante.
  organizationId: string;
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
  // Persistent source quote for remaining charge quantities across siblings.
  quoteId: string | null;
};

export async function buildPlan(
  supabase: SupabaseClient,
  organizationId?: string | null,
  planningDate?: Date,
  futureOptions: FuturePeriodOptions = {},
): Promise<{
  lines: PreviewLine[];
  items: PlanItem[];
  truncated: boolean;
  pendingCount: number;
}> {
  // Ejecución manual (usuario autenticado): acotar SIEMPRE a su propia
  // organización (nunca al payload). El cron (organizationId=null/undefined)
  // procesa todas las organizaciones; cada reserva conserva su propia
  // organization_id y la agrupación posterior nunca mezcla empresas.
  let bookingsQuery = supabase
    .from("bookings")
    .select(
      "id, organization_id, booking_number, customer_id, customer_name, quote_id, start_date, end_date, last_billed_date, monthly_rate, currency, tipo_cambio, updated_at, forklifts(name, monthly_rate, serial_number), quotes(organization_id, line_items, rental_meta)",
    )
    .eq("recurring_billing", true)
    .eq("status", "confirmed");
  if (organizationId) {
    bookingsQuery = bookingsQuery.eq("organization_id", organizationId);
  }
  const { data: bookings, error: bErr } = await bookingsQuery;
  if (bErr) throw bErr;

  // M-13: precargar la tasa de IVA de cada cliente para exponerla en el preview.
  const customerIds = Array.from(
    new Set(
      ((bookings || []) as Array<{ customer_id: string | null }>)
        .map((b) => b.customer_id)
        .filter((id): id is string => !!id),
    ),
  );
  // Multiempresa: la tarifa fiscal es propiedad de la relación
  // organization_customers (organización + cliente), no del cliente global.
  // La clave del mapa incluye la organización para no mezclar tasas de dos
  // empresas que comparten el mismo cliente.
  const taxRateByCustomer = new Map<string, number | null>();
  const fiscalByCustomer = new Map<string, unknown>();
  if (customerIds.length > 0) {
    const { data: custRows, error: custErr } = await supabase
      .from("organization_customers")
      .select(
        "organization_id, customer_id, tax_rate, rfc, razon_social, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi",
      )
      .in("customer_id", customerIds);
    if (custErr) throw custErr;
    for (
      const c of (custRows ?? []) as Array<
        {
          organization_id: string;
          customer_id: string;
          tax_rate: number | null;
        }
      >
    ) {
      fiscalByCustomer.set(`${c.organization_id}|${c.customer_id}`, c);
      taxRateByCustomer.set(
        `${c.organization_id}|${c.customer_id}`,
        c.tax_rate,
      );
    }
  }

  const nowMty = planningDate ?? nowInMonterrey();
  const planningLimit = futurePeriodLimit(futureOptions, nowMty);
  const lines: PreviewLine[] = [];
  const items: PlanItem[] = [];
  let truncated = false;
  let pendingCount = 0;

  const chargeReview = new Map<string, boolean>();
  const chargeSnapshot = new Map<string, unknown>();
  for (const booking of bookings || []) {
    const forklift = (booking.forklifts as Forklift | null) ?? null;
    let quoteIssue: PreviewLine["reason"] | null = recurringQuoteIssue(
      booking.quote_id,
      booking.organization_id,
      booking.quotes,
    );

    if (booking.quote_id && !quoteIssue) {
      if (!chargeReview.has(booking.quote_id)) {
        const { data, error } = await supabase.rpc(
          "get_quote_charge_availability",
          {
            p_quote_ids: [booking.quote_id],
          },
        );
        if (error) throw error;
        chargeSnapshot.set(booking.quote_id, data);
        try {
          recurringQuoteCharges(data, [booking.quote_id]);
          chargeReview.set(booking.quote_id, false);
        } catch {
          chargeReview.set(booking.quote_id, true);
        }
      }
      if (chargeReview.get(booking.quote_id)) {
        quoteIssue = "quote_charge_review";
      }
    }

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

    // Period history includes pivot and legacy direct links. Charge availability
    // is independently read from the authoritative source-identity RPC.
    const invoiceFields =
      "id, invoice_number, billing_period_start, billing_period_end, status, cfdi_status, cfdi_uuid, cancellation_status, line_items";
    const { data: linked, error: linkedErr } = await supabase
      .from("invoice_bookings")
      .select(`invoices!inner(${invoiceFields}, organization_id)`)
      .eq("booking_id", booking.id)
      .eq("invoices.organization_id", booking.organization_id);
    if (linkedErr) throw linkedErr;
    const { data: direct, error: directErr } = await supabase
      .from("invoices")
      .select(invoiceFields)
      .eq("booking_id", booking.id)
      .eq("organization_id", booking.organization_id);
    if (directErr) throw directErr;

    // Los registros legacy pueden existir sólo en invoices.booking_id, sin
    // pivote. Incluir ambos caminos evita volver a facturar ese periodo.
    // Filtrar en JS conserva cfdi_status NULL, que SQL considera vigente.
    const invoices = mergeLiveInvoiceHistory(
      (linked ?? []) as unknown as Array<
        { invoices: HistoricalInvoice | null }
      >,
      (direct ?? []) as HistoricalInvoice[],
    );
    const pending = pendingCanonicalPeriods(
      booking.start_date,
      booking.end_date,
      planningLimit,
      invoices,
    );
    const coverageSnapshot = invoices.map((invoice) => ({
      id: invoice.id,
      start: invoice.billing_period_start,
      end: invoice.billing_period_end,
    })).sort((a, b) => a.id.localeCompare(b.id));
    let emitted = 0;
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
          ? taxRateByCustomer.get(
            `${booking.organization_id}|${booking.customer_id}`,
          ) ?? null
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
      const coverage = periodCoverage(invoices, startStr, endStr);
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
        fiscal: fiscalByCustomer.get(
          `${booking.organization_id}|${booking.customer_id}`,
        ) ?? null,
        quoteId: booking.quote_id ?? null,
        quote: booking.quotes ?? null,
        charges: chargeSnapshot.get(booking.quote_id) ?? null,
        rateWarning,
      });
      lines.push(baseLine);
      items.push({
        ...(futureOptions.includeFuturePeriods
          ? {
            fiscalFingerprint: await previewFingerprint(
              fiscalSnapshot(
                fiscalByCustomer.get(
                  `${booking.organization_id}|${booking.customer_id}`,
                ),
              ),
            ),
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

function fiscalSnapshot(value: unknown) {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    tax_rate: resolveVatRatePercent(
      typeof row.tax_rate === "number" || typeof row.tax_rate === "string"
        ? row.tax_rate
        : null,
    ),
    rfc: row.rfc ?? null,
    razon_social: row.razon_social ?? null,
    regimen_fiscal: row.regimen_fiscal ?? null,
    domicilio_fiscal_cp: row.domicilio_fiscal_cp ?? null,
    uso_cfdi: row.uso_cfdi ?? null,
  };
}

/** Hash server-owned commercial data. No customer fiscal data is exposed. */
async function previewFingerprint(snapshot: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error && error !== "[object Object]" ? error : "Error sin detalle";
  }
  if (error instanceof Error) return error.message || "Error sin detalle";
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    const parts: string[] = [];
    if (e.message !== undefined) parts.push(errorMessage(e.message));
    if (typeof e.details === "string" && e.details) parts.push(e.details);
    if (typeof e.hint === "string" && e.hint) parts.push(e.hint);
    if (typeof e.code === "string" && e.code) parts.push(`(código ${e.code})`);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "Error sin detalle";
    }
  }
  return error == null ? "Error sin detalle" : String(error);
}

export async function executePlan(
  supabase: SupabaseClient,
  items: PlanItem[],
  allowStaleRate = false,
) {
  const created: Array<{
    bookingIds: string[];
    invoiceId: string;
    invoiceNumber: string | null;
  }> = [];
  const alreadyExisting: typeof created = [];
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

  const blockedBefore = new Map<string, string>();
  if (!allowStaleRate) {
    const stale = items.filter((i) => i.rateWarning);
    for (const i of stale) {
      const earliest = blockedBefore.get(i.bookingId);
      if (!earliest || i.startStr < earliest) {
        blockedBefore.set(i.bookingId, i.startStr);
      }
      skippedStaleRate.push({
        bookingIds: [i.bookingId],
        periodStart: i.startStr,
        periodEnd: i.endStr,
      });
    }
    items = items.filter((i) => !i.rateWarning);
  }

  const groups = groupPlanItems(items);

  for (
    const group of [...groups.values()].sort((a, b) =>
      a[0].startStr.localeCompare(b[0].startStr)
    )
  ) {
    const first = group[0];
    const bookingIds = group.map((i) => i.bookingId);

    try {
      if (
        group.some((item) =>
          item.isFuture && blockedBefore.has(item.bookingId) &&
          blockedBefore.get(item.bookingId)! < item.startStr
        )
      ) {
        throw new Error(
          "No se anticipó el período porque uno anterior no pudo generarse",
        );
      }
      // Multiempresa: los datos comerciales/fiscales de facturación viven en
      // organization_customers (organización + cliente); `customers` es sólo
      // la identidad global y ya no se usa aquí para el receptor del CFDI.
      const { data: customer, error: customerError } = await supabase
        .from("organization_customers")
        .select(
          "rfc, razon_social, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi, tax_rate",
        )
        .eq("customer_id", first.customerId)
        .eq("organization_id", first.organizationId)
        .maybeSingle();
      if (customerError) throw customerError;
      if (group.some((item) => item.fiscalFingerprint)) {
        const currentFiscalFingerprint = await previewFingerprint(
          fiscalSnapshot(customer),
        );
        if (
          group.some((item) =>
            item.fiscalFingerprint &&
            item.fiscalFingerprint !== currentFiscalFingerprint
          )
        ) {
          throw new Error(
            "Los datos fiscales cambiaron; actualiza la vista previa",
          );
        }
      }

      // Re-read before every group/catch-up period. The SQL guard atomically
      // reserves these exact source quantities, including sibling bookings.
      const quoteIds = [
        ...new Set(
          group.map((i) => i.quoteId).filter((id): id is string => !!id),
        ),
      ];
      const { data: chargeAvailability, error: chargeError } = await supabase
        .rpc(
          "get_quote_charge_availability",
          { p_quote_ids: quoteIds },
        );
      if (chargeError) throw chargeError;
      const extraLines = recurringQuoteCharges(chargeAvailability, quoteIds);

      const rentalLines = group.map((i) => {
        const proratedLabel = i.isProrated
          ? ` — prorrateado ${i.proratedDays} días`
          : "";
        return {
          description: `${i.forkliftName || "Montacargas"} — Renta mensual (${
            fmtMx(i.billingStart)
          } al ${fmtMx(i.billingEnd)}${proratedLabel})${
            i.forkliftSerial ? ` (Serie: ${i.forkliftSerial})` : ""
          }`,
          line_kind: "rental",
          quantity: 1,
          unit_price: i.billedAmount,
          total: i.billedAmount,
        };
      });
      const lineItems = [...rentalLines, ...extraLines];
      const billedAmounts = [
        ...group.map((i) => i.billedAmount),
      ];

      // M23: tasa por cliente (frontera 8%, exento 0%) en vez de 16 fijo,
      // y aritmética en centavos enteros (_shared/money.ts) en vez de floats
      // con Math.round — elimina el drift de centavos acumulado por período.
      const rentalSubtotalCents = sumMoneyCents(billedAmounts);
      // R9-14: `resolveVatRatePercent` distingue "sin dato" (null/undefined/NaN
      // -> DEFAULT_VAT_RATE_PERCENT) de "0% explícito" (se respeta). Antes
      // `Number(customer?.tax_rate)` convertía null en 0 y generaba IVA 0%
      // inesperado cuando el cliente no tenía tasa capturada.
      const taxRate = resolveVatRatePercent(customer?.tax_rate);
      assertNoLegacyVat({ tax_rate: taxRate, line_items: lineItems });
      // A1-B2: IVA línea por línea (mismo criterio que computeTotals y que
      // Facturapi al timbrar). Redondear una sola vez sobre el subtotal
      // agregado generaba varianzas de centavos que dejaban la factura
      // recurrente en cfdi_status='error' (BL-A5).
      const chargeAmounts = extraLines.map((line) =>
        recurringChargeAmounts(line, taxRate)
      );
      const subtotalCents = rentalSubtotalCents +
        chargeAmounts.reduce((sum, line) => sum + line.netCents, 0);
      const taxAmountCents = sumLineTaxCents(billedAmounts, taxRate) +
        chargeAmounts.reduce((sum, line) => sum + line.taxCents, 0);

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
          p_receptor_razon_social: customer?.razon_social ||
            first.customerName ||
            null,
          p_receptor_regimen_fiscal: customer?.regimen_fiscal ?? null,
          p_receptor_domicilio_fiscal_cp: customer?.domicilio_fiscal_cp ?? null,
          // Residual (b): sin default "G03"; el uso de CFDI debe venir del
          // cliente (la RPC rechaza el periodo si falta y se reporta el error).
          p_uso_cfdi: customer?.uso_cfdi ?? null,
          // Moneda y tipo de cambio pactados en la reserva.
          p_moneda: first.currency,
          p_tipo_cambio: first.tipoCambio,
        },
      );

      if (rpcErr) {
        throw rpcErr;
      }

      const row = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
      if (!row?.invoice_id) throw new Error("RPC returned no invoice_id");

      const result = {
        bookingIds,
        invoiceId: row.invoice_id as string,
        invoiceNumber: (row.invoice_number as string) ?? null,
      };
      if (row.already_existed === true) alreadyExisting.push(result);
      else created.push(result);
    } catch (err) {
      const message = errorMessage(err);
      console.error("[generate-recurring-invoices] period failed", {
        bookingIds,
        message,
      });
      failed.push({ bookingIds, error: message });
      for (const item of group) {
        const earliest = blockedBefore.get(item.bookingId);
        if (!earliest || item.startStr < earliest) {
          blockedBefore.set(item.bookingId, item.startStr);
        }
      }
    }
  }

  return { created, alreadyExisting, failed, rateWarnings, skippedStaleRate };
}

export type HandlerDependencies = {
  authenticateCronRequest?: typeof authenticateCronRequest;
  requireServiceOrRole?: typeof requireServiceOrRole;
  getAdminClient?: typeof getAdminClient;
  planningDate?: Date;
};

/** Importable HTTP boundary; only index.ts registers the Edge listener. */
export async function handleRequest(
  req: Request,
  dependencies: HandlerDependencies = {},
): Promise<Response> {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    // Lote C · DIFF 8 rest: auth timing-safe compartida para cron/service.
    const cronAuth =
      await (dependencies.authenticateCronRequest ?? authenticateCronRequest)(
        req,
      );
    let supabase;
    // Multiempresa Fase 1: ejecuciones manuales (usuario autenticado) se
    // acotan SIEMPRE a la organización del caller (nunca al payload). El
    // cron (y el bypass service_role interno) procesan todas las
    // organizaciones; cada reserva conserva su propia organization_id y la
    // agrupación posterior (buildPlan/executePlan) nunca mezcla empresas.
    let scopeOrganizationId: string | null = null;
    if (cronAuth.ok) {
      supabase = (dependencies.getAdminClient ?? getAdminClient)();
    } else {
      const auth =
        await (dependencies.requireServiceOrRole ?? requireServiceOrRole)(req, [
          "admin",
          "administrativo",
        ]);
      if (!auth.ok) return auth.response;
      supabase = auth.adminClient;
      if (auth.role !== "service_role") {
        const callerOrg = await resolveCallerOrganization(
          supabase,
          auth.userId,
        );
        if (!callerOrg.ok) {
          return jsonError(req, callerOrg.status, callerOrg.message);
        }
        scopeOrganizationId = callerOrg.organizationId;
      }
    }

    // Parse body (may be empty for legacy callers)
    let body: {
      preview?: boolean;
      bookingIds?: string[];
      // R9-18: selección explícita reserva + periodo desde el asistente.
      selections?: Array<
        {
          bookingId?: string;
          periodStart?: string;
          expectedFingerprint?: string;
        }
      >;
      allowStaleRate?: boolean;
      includeFuturePeriods?: boolean;
      futureThroughMonth?: string;
    } = {};
    try {
      const text = await req.text();
      if (text) body = JSON.parse(text);
    } catch {
      return jsonError(req, 400, "JSON inválido");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError(req, 400, "Se requiere un objeto JSON");
    }
    for (const key of ["preview", "allowStaleRate"] as const) {
      if (body[key] !== undefined && typeof body[key] !== "boolean") {
        return jsonError(req, 400, `${key} debe ser booleano`);
      }
    }
    try {
      futurePeriodLimit(body, dependencies.planningDate ?? nowInMonterrey());
    } catch (error) {
      return jsonError(req, 400, errorMessage(error));
    }
    if (
      body.selections !== undefined &&
      (!Array.isArray(body.selections) ||
        body.selections.some((selection) =>
          !selection || typeof selection !== "object" ||
          typeof selection.bookingId !== "string" || !selection.bookingId ||
          typeof selection.periodStart !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(selection.periodStart) ||
          !Number.isFinite(Date.parse(`${selection.periodStart}T00:00:00Z`)) ||
          new Date(`${selection.periodStart}T00:00:00Z`).toISOString().slice(
              0,
              10,
            ) !== selection.periodStart
        ))
    ) return jsonError(req, 400, "Selección de períodos inválida");
    if (
      body.bookingIds !== undefined &&
      (!Array.isArray(body.bookingIds) ||
        body.bookingIds.some((id) => typeof id !== "string" || !id))
    ) {
      return jsonError(req, 400, "Selección de reservas inválida");
    }
    if (body.includeFuturePeriods === true) {
      if (!scopeOrganizationId) {
        return jsonError(
          req,
          403,
          "Anticipar períodos requiere un operador autenticado",
        );
      }
      if (
        body.bookingIds !== undefined ||
        (!body.preview && !Array.isArray(body.selections))
      ) {
        return jsonError(
          req,
          400,
          "Anticipar períodos requiere selección exacta de reserva y período",
        );
      }
    }

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
        alreadyExisting: [],
        failed: [],
        rateWarnings: [],
        skippedStaleRate: [],
      });
    }

    const { lines, items: allItems, truncated, pendingCount } = await buildPlan(
      supabase,
      scopeOrganizationId,
      dependencies.planningDate,
      body,
    );

    const eligibleLines = lines.filter((l) => l.eligible);
    const periodMonth = eligibleLines[0]?.periodStart?.slice(0, 7) ?? null;

    if (body.preview) {
      return jsonResponse(req, {
        success: true,
        period: periodMonth,
        lines,
        truncated,
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

    if (
      body.includeFuturePeriods &&
      body.selections?.some((selection) =>
        !targetItems.some((item) =>
          item.bookingId === selection.bookingId &&
          item.startStr === selection.periodStart
        ) ||
        typeof selection.expectedFingerprint !== "string" ||
        !lines.some((line) =>
          line.eligible && line.bookingId === selection.bookingId &&
          line.periodStart === selection.periodStart &&
          line.previewFingerprint === selection.expectedFingerprint
        )
      )
    ) {
      return jsonError(
        req,
        409,
        "La selección cambió o ya no está disponible; actualiza la vista previa",
      );
    }

    // An advance must include every still-unbilled earlier period for that
    // booking. This is checked for the entire batch before any write; SQL
    // repeats the invariant under booking locks to cover concurrent changes.
    const selectedKeys = new Set(
      targetItems.map((item) => `${item.bookingId}|${item.startStr}`),
    );
    for (const item of targetItems) {
      if (
        !lines.some((line) =>
          line.bookingId === item.bookingId &&
          line.periodStart === item.startStr && line.isFuture
        )
      ) continue;
      if (
        lines.some((line) =>
          line.bookingId === item.bookingId &&
          line.periodStart < item.startStr &&
          (!line.eligible ||
            !selectedKeys.has(`${line.bookingId}|${line.periodStart}`))
        )
      ) {
        return jsonError(
          req,
          409,
          "Para anticipar un período debes seleccionar todos los períodos pendientes anteriores de la reserva",
        );
      }
    }

    // R6-F5: sólo un operador autenticado (no el cron) puede confirmar
    // facturar periodos cuya tarifa pudo cambiar después del periodo.
    const allowStaleRate = !!scopeOrganizationId &&
      body.allowStaleRate === true;

    const { created, alreadyExisting, failed, rateWarnings, skippedStaleRate } =
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
      alreadyExisting,
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
}
