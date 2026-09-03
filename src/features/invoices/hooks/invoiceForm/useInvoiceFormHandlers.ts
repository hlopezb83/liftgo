import type { Forklift } from "@/features/fleet";
import { monthBounds } from "@/lib/date/monthBounds";
import { resolveBookingRates } from "@/lib/domain/bookingRates";
import { firstBillingPeriod, prorateMonthlyLine } from "@/lib/domain/firstBillingPeriod";
import { generateLineItems } from "@/lib/domain/invoiceHelpers";
import { extractNonRentalLines } from "@/lib/domain/nonRentalLines";
import { nowMty } from "@/lib/utils";
import { cfdiFromCustomer, type Customer } from "./invoiceFormBuilders";
import type { InvoiceFormValues, LineItemValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";


type Booking = {
  id: string; customer_name?: string | null; customer_id?: string | null;
  forklift_id: string; start_date: string; end_date: string;
  quote_id?: string | null;
  /** Tarifas pactadas en la reserva; null si no se capturaron (caen al montacargas). */
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
  /** A1-2: moneda/TC pactados en la reserva; se heredan si no son MXN para no
   *  facturar en MXN montos cotizados/rentados en USD. */
  currency?: string | null;
  tipo_cambio?: number | string | null;
  recurring_billing?: boolean | null;
};

type QuoteSource = { id: string; line_items: unknown };

interface Props {
  form: UseFormReturn<InvoiceFormValues>;
  customers: Customer[] | undefined;
  bookings: Booking[] | undefined;
  forklifts: Forklift[] | undefined;
  /** Cotizaciones origen de las reservas cargadas; se usan para arrastrar
   *  partidas no-renta (logística/entrega) a la factura. */
  quotes?: QuoteSource[] | undefined;
  /** FIX-4: reservas cuyas partidas extra (seguro/logística) YA se facturaron.
   *  No se vuelven a pre-cargar para evitar doble cobro. */
  bookingsWithBilledExtras?: Set<string> | undefined;
}

function applyCfdiPatch(form: UseFormReturn<InvoiceFormValues>, customer: Customer) {
  const patch = cfdiFromCustomer(customer);
  (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
    const v = patch[k];
    if (v !== undefined) form.setValue(`cfdi.${k}`, v, { shouldDirty: true });
  });
  // FIX-3: la tasa de IVA del cliente (p. ej. frontera 8%) manda sobre el 16%
  // por defecto. Sólo se aplica si está capturada y es un número válido.
  const rate = Number(customer.tax_rate);
  if (customer.tax_rate != null && Number.isFinite(rate) && rate >= 0) {
    form.setValue("taxRate", rate, { shouldDirty: true });
  }
}


const SAT_LINE_DEFAULTS = {
  clave_prod_serv: "78181500",
  clave_unidad: "DAY",
  objeto_imp: "02",
} as const;

function monthLabel(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const name = new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("es-MX", { month: "long" });
  return `${name} ${y}`;
}

export function buildLinesForBooking(booking: Booking, forklifts: Forklift[] | undefined): LineItemValues[] {
  const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
  if (!forklift) return [];
  // FIX-2: misma regla canónica que las extensiones (`resolveBookingRates`):
  // la tarifa pactada gana SÓLO si es > 0; en 0/null cae a la del catálogo.
  const resolved = resolveBookingRates(forklift, booking);
  const rated: Forklift = {
    ...forklift,
    daily_rate: resolved.daily,
    weekly_rate: resolved.weekly,
    monthly_rate: resolved.monthly,
  };


  // El corte al primer mes sólo pertenece al flujo recurrente. Una reserva no
  // recurrente se factura completa para no dejar meses fuera silenciosamente.
  const period = firstBillingPeriod(booking.start_date, booking.end_date);
  if (booking.recurring_billing === true && period?.truncated) {
    const monthly = rated.monthly_rate ?? 0;
    const prorated = period.isProrated ? prorateMonthlyLine(monthly, period.billedDays, period.daysInMonth) : null;
    if (prorated) {
      return [{
        description:
          `${forklift.name} — Renta ${monthLabel(period.start)} (${prorated.quantity} días al precio diario)`,
        quantity: prorated.quantity,
        unit_price: prorated.unitPrice,
        total: prorated.total,
        ...SAT_LINE_DEFAULTS,
      }];
    }
    return generateLineItems(rated, period.start, period.end).map((item) => ({
      ...item,
      ...SAT_LINE_DEFAULTS,
    }));
  }

  const items = generateLineItems(rated, booking.start_date, booking.end_date);
  return items.map((item) => ({
    ...item,
    ...SAT_LINE_DEFAULTS,
  }));
}

function applyPrimaryCustomer(
  form: UseFormReturn<InvoiceFormValues>,
  first: Booking,
  customers: Customer[] | undefined,
) {
  form.setValue("customerName", first.customer_name || "", { shouldDirty: true });
  form.setValue("customerId", first.customer_id || "", { shouldDirty: true });
  if (!first.customer_id || !customers) return;
  const customer = customers.find((c) => c.id === first.customer_id);
  if (customer) applyCfdiPatch(form, customer);
}

/**
 * A1-2: hereda moneda/TC de la reserva primaria cuando no es MXN, evitando
 * facturar en MXN montos pactados en USD (mismo patrón que `buildFromQuote`
 * para cotizaciones en `invoiceFormBuilders.ts`).
 */
function applyPrimaryCurrency(form: UseFormReturn<InvoiceFormValues>, first: Booking) {
  if (first.currency !== "USD") return;
  form.setValue("cfdi.moneda", "USD", { shouldDirty: true });
  const fx = Number(first.tipo_cambio);
  if (Number.isFinite(fx) && fx > 0) {
    form.setValue("cfdi.tipoCambio", fx, { shouldDirty: true });
  }
}

function collectExtraLinesFromQuotes(
  selected: Booking[],
  quotes: QuoteSource[] | undefined,
  alreadyBilled?: Set<string> | undefined,
): LineItemValues[] {
  // Arrastrar partidas no-renta (logística/entrega) desde la cotización origen.
  // Deduplicado por quote_id para no repetirlas si la cotización se dividió en varias reservas.
  const seenQuoteIds = new Set<string>();
  const extraLines: LineItemValues[] = [];
  for (const b of selected) {
    if (!b.quote_id || seenQuoteIds.has(b.quote_id)) continue;
    // FIX-4: si la reserva ya tiene una factura vigente con partidas extra,
    // no se vuelven a pre-cargar (se cobrarían dos veces).
    if (alreadyBilled?.has(b.id)) continue;
    seenQuoteIds.add(b.quote_id);
    const q = quotes?.find((x) => x.id === b.quote_id);
    if (!q) continue;
    extraLines.push(...extractNonRentalLines(q.line_items));
  }
  return extraLines;
}

/**
 * H-6 / Bug 4: periodo pre-llenado al ligar una reserva.
 * - No recurrente → exactamente el rango de la reserva.
 * - Recurrente → primer ciclo (inicio de reserva → fin de ese mes o fin de la
 *   reserva si termina antes). Antes sólo `truncated` usaba la reserva y una
 *   recurrente que terminaba dentro de su mes inicial caía a `monthBounds`
 *   de la fecha de emisión, proponiendo un mes ajeno a la reserva.
 * - Sin reserva o fechas inválidas → mes de la fecha de emisión (fallback).
 */
export function prefillBillingPeriod(
  booking: Pick<Booking, "start_date" | "end_date" | "recurring_billing"> | undefined,
  issueDate: Date,
): { start: string; end: string } {
  if (booking && !booking.recurring_billing) {
    return { start: booking.start_date, end: booking.end_date };
  }
  const first = booking ? firstBillingPeriod(booking.start_date, booking.end_date) : null;
  if (first) return { start: first.start, end: first.end };
  return monthBounds(issueDate);
}

export function useInvoiceFormHandlers({ form, customers, bookings, forklifts, quotes, bookingsWithBilledExtras }: Props) {

  const handleCustomerSelect = (selectedCustomerId: string) => {
    form.setValue("customerId", selectedCustomerId, { shouldDirty: true });
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    form.setValue("customerName", customer.name, { shouldDirty: true });
    applyCfdiPatch(form, customer);
  };

  const handleBookingsChange = (selectedIds: string[]) => {
    const selected = selectedIds
      .map((id) => bookings?.find((b) => b.id === id))
      .filter((b): b is Booking => !!b);

    form.setValue("bookingIds", selectedIds, { shouldDirty: true });
    form.setValue("bookingId", selectedIds[0] ?? "", { shouldDirty: true });

    // H-6 / Bug 4: pre-llenar el periodo sólo si el usuario no lo capturó;
    // siempre acotado a las fechas de la reserva (ver prefillBillingPeriod).
    if (selectedIds.length > 0 && !form.getValues("billingPeriodStart")) {
      const issue = form.getValues("issueDate") ?? nowMty();
      const { start, end } = prefillBillingPeriod(selected[0], issue);
      form.setValue("billingPeriodStart", start, { shouldDirty: true });
      form.setValue("billingPeriodEnd", end, { shouldDirty: true });
    }

    if (selected.length === 0) return;

    applyPrimaryCustomer(form, selected[0], customers);
    applyPrimaryCurrency(form, selected[0]);

    const rentalLines = selected.flatMap((b) => buildLinesForBooking(b, forklifts));
    const extraLines = collectExtraLinesFromQuotes(selected, quotes, bookingsWithBilledExtras);

    form.setValue("lineItems", [...rentalLines, ...extraLines], { shouldDirty: true });
  };

  // Compat: handler antiguo single-select (delega al multi).
  const handleBookingSelect = (id: string) => {
    handleBookingsChange(id ? [id] : []);
  };

  return { handleCustomerSelect, handleBookingSelect, handleBookingsChange };
}
