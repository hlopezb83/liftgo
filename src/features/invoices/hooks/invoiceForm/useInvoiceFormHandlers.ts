import currency from "currency.js";
import { useRef, useState } from "react";
import type { Forklift } from "@/features/fleet";
import { resolveBookingRates } from "@/lib/domain/bookingRates";
import { firstBillingPeriod, prorateMonthlyLine } from "@/lib/domain/firstBillingPeriod";
import { generateLineItems } from "@/lib/domain/invoiceHelpers";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { prefillBillingPeriod } from "../../lib/bookingCompatibility";
import { applyQuoteChargeAvailability, buildAvailableQuoteChargeLines, preserveEnteredQuoteChargeLines, type QuoteChargeAvailability } from "../../lib/quoteChargeAvailability";
import { buildQuotedBookingLines, type BookingQuoteSource } from "../../lib/quotedBookingLines";
import { cfdiFromCustomer, type Customer } from "./invoiceFormBuilders";
import type { InvoiceFormValues, LineItemValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

// Regla canónica del periodo pre-llenado: vive en `lib/bookingCompatibility`
// porque también la usan el selector multi-reserva y la validación al guardar.
export { prefillBillingPeriod };


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
  pending_billing_period?: { start: string; end: string };
};

type QuoteSource = BookingQuoteSource;

interface Props {
  form: UseFormReturn<InvoiceFormValues>;
  customers: Customer[] | undefined;
  bookings: Booking[] | undefined;
  forklifts: Forklift[] | undefined;
  /** Cotizaciones origen de las reservas cargadas; se usan para arrastrar
   *  partidas no-renta (logística/entrega) a la factura. */
  quotes?: QuoteSource[] | undefined;
  loadQuoteCharges: (quoteIds: string[]) => Promise<QuoteChargeAvailability>;
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
  line_kind: "rental",
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
  if (booking.pending_billing_period) {
    const cycle = firstBillingPeriod(booking.pending_billing_period.start, booking.pending_billing_period.end);
    if (!cycle) return [];
    const monthly = booking.monthly_rate ?? forklift.monthly_rate;
    if (monthly == null || !Number.isFinite(monthly) || monthly < 0) throw new Error("La reserva recurrente no tiene una tarifa mensual válida. Revisa la tarifa pactada antes de facturar.");
    const amount = Math.round(currency(monthly).intValue * cycle.billedDays / cycle.daysInMonth) / 100;
    return [{ description: `${forklift.name} — Renta mensual ${monthLabel(cycle.start)} (${cycle.billedDays} días)`,
      quantity: 1, unit_price: amount, total: amount, ...SAT_LINE_DEFAULTS, clave_unidad: "E48" }];
  }
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

/** Replace both fields whenever the primary booking changes; otherwise an
 * earlier manual USD choice survives a later MXN selection. */
export function applyPrimaryCurrency<T extends Pick<Booking, "currency" | "tipo_cambio">>(
  form: UseFormReturn<InvoiceFormValues>,
  first: T,
) {
  const currency = first.currency?.trim().toUpperCase() || "MXN";
  form.setValue("cfdi.moneda", currency, { shouldDirty: true });
  const fx = Number(first.tipo_cambio);
  form.setValue("cfdi.tipoCambio", currency === "MXN" ? 1 : Number.isFinite(fx) && fx > 0 ? fx : 0,
    { shouldDirty: true });
}

async function availableChargesForBookings(
  selected: Booking[], quotes: QuoteSource[] | undefined, loadQuoteCharges: Props["loadQuoteCharges"],
): Promise<LineItemValues[]> {
  const quoteIds = [...new Set(selected.flatMap((booking) => booking.quote_id ? [booking.quote_id] : []))];
  const availability = quoteIds.length ? await loadQuoteCharges(quoteIds) : undefined;
  for (const quoteId of quoteIds) {
    const source = quotes?.find((quote) => quote.id === quoteId);
    if (!Array.isArray(source?.line_items)) throw new Error("No se pudieron verificar las partidas de la cotización. Recarga y reintenta.");
    applyQuoteChargeAvailability(quoteId, source.line_items as LineItemValues[], availability);
  }
  return buildAvailableQuoteChargeLines(quoteIds, availability);
}

export function useInvoiceFormHandlers({ form, customers, bookings, forklifts, quotes, loadQuoteCharges }: Props) {

  const selectionRequest = useRef(0);
  const [isLoadingCharges, setIsLoadingCharges] = useState(false);
  const [chargeSelectionError, setChargeSelectionError] = useState<string | null>(null);
  const [lastSelection, setLastSelection] = useState<string[]>([]);

  const handleCustomerSelect = (selectedCustomerId: string) => {
    form.setValue("customerId", selectedCustomerId, { shouldDirty: true });
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    form.setValue("customerName", customer.name, { shouldDirty: true });
    applyCfdiPatch(form, customer);
  };

  const handleBookingsChange = async (selectedIds: string[]) => {
    const request = ++selectionRequest.current;
    setChargeSelectionError(null);
    setLastSelection(selectedIds);
    const selected = selectedIds
      .map((id) => bookings?.find((b) => b.id === id))
      .filter((b): b is Booking => !!b);

    let rentalLines: LineItemValues[];
    let extraLines: LineItemValues[];
    setIsLoadingCharges(true);
    try {
      if (selected.length !== new Set(selectedIds).size) throw new Error("No se pudieron cargar todas las reservas seleccionadas. Recarga las reservas y reintenta.");
      rentalLines = buildQuotedBookingLines(selected, bookings ?? [], forklifts ?? [], quotes,
        (booking) => buildLinesForBooking(booking, forklifts));
      const available = await availableChargesForBookings(selected, quotes, loadQuoteCharges);
      if (request !== selectionRequest.current) return;
      const current = form.getValues("lineItems");
      extraLines = preserveEnteredQuoteChargeLines(available, current);
    } catch (error) {
      if (request !== selectionRequest.current) return;
      const message = error instanceof Error ? error.message : "No se pudieron recuperar los precios pactados.";
      setChargeSelectionError(message);
      notifyValidation({ message });
      return;
    } finally {
      if (request === selectionRequest.current) setIsLoadingCharges(false);
    }

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

    form.setValue("lineItems", [...rentalLines, ...extraLines], { shouldDirty: true });
  };

  // Compat: handler antiguo single-select (delega al multi).
  const handleBookingSelect = (id: string) => {
    handleBookingsChange(id ? [id] : []);
  };

  return { handleCustomerSelect, handleBookingSelect, handleBookingsChange, isLoadingCharges, chargeSelectionError, retryChargeSelection: () => handleBookingsChange(lastSelection) };
}
