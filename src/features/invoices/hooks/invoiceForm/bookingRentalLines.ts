import { customerTaxRate } from "@/features/customers";
import { resolveBookingRates } from "@/lib/domain/bookingRates";
import { generateLineItems } from "@/lib/domain/invoiceHelpers";
import { proratedMonthlyAmount } from "@/lib/domain/invoiceTotals";
import { formatMtyDate, nowMty } from "@/lib/utils";
import { prefillBillingPeriod } from "../../lib/bookingCompatibility";
import { firstBillingPeriod, prorateMonthlyLine } from "../../lib/firstBillingPeriod";
import { anniversaryCycleDays } from "../../lib/pendingRecurringPeriod";
import { cfdiFromCustomer, type Customer } from "./invoiceFormBuilders";
import type { InvoiceRentalEquipment } from "./useInvoiceRentalEquipment";
import type { InvoiceFormValues, LineItemValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

export interface InvoiceHandlerBooking {
  id: string;
  customer_name?: string | null;
  customer_id?: string | null;
  forklift_id: string;
  start_date: string;
  end_date: string;
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
  pending_billing_cycle?: "anniversary";
}

const SAT_LINE_DEFAULTS = {
  clave_prod_serv: "78121604",
  clave_unidad: "DAY",
  objeto_imp: "02",
  line_kind: "rental",
} as const;

function monthLabel(ymd: string): string {
  return formatMtyDate(ymd, "MMMM yyyy").toLowerCase();
}

function buildPendingCycleLines(
  booking: InvoiceHandlerBooking,
  forklift: InvoiceRentalEquipment,
): LineItemValues[] {
  if (!booking.pending_billing_period) return [];
  const { start, end } = booking.pending_billing_period;
  const anniversary = booking.pending_billing_cycle === "anniversary";
  const calendarCycle = firstBillingPeriod(start, end);
  const cycle = anniversary ? anniversaryCycleDays(start, end) : calendarCycle;
  if (!cycle) return [];
  const monthly = booking.monthly_rate ?? forklift.monthly_rate;
  if (monthly == null || !Number.isFinite(monthly) || monthly < 0) {
    throw new Error("La reserva recurrente no tiene una tarifa mensual válida. Revisa la tarifa pactada antes de facturar.");
  }
  const amount = proratedMonthlyAmount(monthly, cycle.billedDays, cycle.daysInMonth);
  return [{
    description: anniversary
      ? `${forklift.name} — Renta mensual ${formatMtyDate(start, "dd/MM/yyyy")} al ${formatMtyDate(end, "dd/MM/yyyy")}`
      : `${forklift.name} — Renta mensual ${monthLabel(cycle.start)} (${cycle.billedDays} días)`,
    quantity: 1,
    unit_price: amount,
    total: amount,
    ...SAT_LINE_DEFAULTS,
    clave_unidad: "E48",
  }];
}

function buildTruncatedRecurringLines(
  rated: InvoiceRentalEquipment,
  startDate: string,
  endDate: string,
): LineItemValues[] | null {
  const period = firstBillingPeriod(startDate, endDate);
  if (!period?.truncated) return null;
  const monthly = rated.monthly_rate ?? 0;
  const prorated = period.isProrated ? prorateMonthlyLine(monthly, period.billedDays, period.daysInMonth) : null;
  if (prorated) {
    return [{
      description: `${rated.name} — Renta ${monthLabel(period.start)} (${prorated.quantity} días al precio diario)`,
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

export function buildLinesForBooking(
  booking: InvoiceHandlerBooking,
  forklifts: InvoiceRentalEquipment[] | undefined,
): LineItemValues[] {
  const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
  if (!forklift) return [];
  // FIX-2: misma regla canónica que las extensiones (`resolveBookingRates`):
  // la tarifa pactada gana SÓLO si es > 0; en 0/null cae a la del catálogo.
  const resolved = resolveBookingRates(forklift, booking);
  const rated: InvoiceRentalEquipment = {
    ...forklift,
    daily_rate: resolved.daily,
    weekly_rate: resolved.weekly,
    monthly_rate: resolved.monthly,
  };

  // El corte al primer mes sólo pertenece al flujo recurrente. Una reserva no
  // recurrente se factura completa para no dejar meses fuera silenciosamente.
  if (booking.pending_billing_period) {
    return buildPendingCycleLines(booking, forklift);
  }
  if (booking.recurring_billing === true) {
    const truncated = buildTruncatedRecurringLines(rated, booking.start_date, booking.end_date);
    if (truncated) return truncated;
  }

  return generateLineItems(rated, booking.start_date, booking.end_date).map((item) => ({
    ...item,
    ...SAT_LINE_DEFAULTS,
  }));
}

function applyCfdiPatch(form: UseFormReturn<InvoiceFormValues>, customer: Customer) {
  const patch = cfdiFromCustomer(customer);
  (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
    const v = patch[k];
    if (v !== undefined) form.setValue(`cfdi.${k}`, v, { shouldDirty: true });
  });
  // FIX-3: la tasa de IVA del cliente (p. ej. frontera 8%) manda sobre el 16%
  // por defecto. Sólo se aplica si está capturada y es un número válido.
  const rate = customerTaxRate(customer.tax_rate);
  if (rate !== undefined) {
    form.setValue("taxRate", rate, { shouldDirty: true });
  }
}

export function applyPrimaryCustomer(
  form: UseFormReturn<InvoiceFormValues>,
  first: InvoiceHandlerBooking,
  customer: Customer | undefined,
) {
  form.setValue("customerName", first.customer_name || "", { shouldDirty: true });
  form.setValue("customerId", first.customer_id || "", { shouldDirty: true });
  if (customer && customer.id === first.customer_id) applyCfdiPatch(form, customer);
}

/** Replace both fields whenever the primary booking changes; otherwise an
 * earlier manual USD choice survives a later MXN selection. */
export function applyPrimaryCurrency<T extends Pick<InvoiceHandlerBooking, "currency" | "tipo_cambio">>(
  form: UseFormReturn<InvoiceFormValues>,
  first: T,
) {
  const currency = first.currency?.trim().toUpperCase() || "MXN";
  form.setValue("cfdi.moneda", currency, { shouldDirty: true });
  const fx = Number(first.tipo_cambio);
  form.setValue(
    "cfdi.tipoCambio",
    currency === "MXN" ? 1 : Number.isFinite(fx) && fx > 0 ? fx : 0,
    { shouldDirty: true },
  );
}

export function applySelectedCustomer(
  form: UseFormReturn<InvoiceFormValues>,
  customers: Customer[] | undefined,
  selectedCustomerId: string,
  selectedCustomer?: Customer,
) {
  form.setValue("customerId", selectedCustomerId, { shouldDirty: true });
  const customer = selectedCustomer?.id === selectedCustomerId
    ? selectedCustomer
    : customers?.find((c) => c.id === selectedCustomerId);
  // Explicit selection replaces receiver-owned fields; never retain another
  // customer's fiscal snapshot, even when the new customer has missing data.
  const receiver = customer ?? { id: selectedCustomerId, name: "" };
  form.setValue("customerName", receiver.name, { shouldDirty: true });
  form.setValue("cfdi.usoCfdi", receiver.uso_cfdi || "G03", { shouldDirty: true });
  form.setValue("taxRate", 16, { shouldDirty: true });
  applyCfdiPatch(form, receiver);
}

export function applyInitialBillingPeriod(
  form: UseFormReturn<InvoiceFormValues>,
  first?: InvoiceHandlerBooking,
) {
  if (!first || form.getValues("billingPeriodStart")) return;
  const { start, end } = prefillBillingPeriod(first, form.getValues("issueDate") ?? nowMty());
  form.setValue("billingPeriodStart", start, { shouldDirty: true });
  form.setValue("billingPeriodEnd", end, { shouldDirty: true });
}
