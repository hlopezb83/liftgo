import { useUpdateQuote } from "@/features/quotes";
import { orEmpty } from "@/lib/coerce";
import { monthBounds } from "@/lib/date/monthBounds";
import { toYMD } from "@/lib/date/toYMD";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceHelpers";
import { toJsonArray } from "@/lib/domain/lineItems";
import { roundMoney } from "@/lib/money";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { nowMty } from "@/lib/utils";
import { useSaveInvoiceWithBookings } from "../invoices/useInvoices";
import type { InvoiceFormValues, CfdiFormValues, LineItemValues } from "../../lib/invoiceFormSchema";


function toLineItems(items: LineItemValues[]): LineItem[] {
  return items.map((i) => ({
    description: i.description ?? "",
    quantity: Number(i.quantity ?? 0),
    unit_price: Number(i.unit_price ?? 0),
    total: Number(i.total ?? 0),
    discount: i.discount,
    discount_type: i.discount_type,
    clave_prod_serv: i.clave_prod_serv,
    clave_unidad: i.clave_unidad,
    objeto_imp: i.objeto_imp,
    tax_rate: i.tax_rate,
  }));
}

interface BuildPayloadArgs {
  values: InvoiceFormValues;
  isEdit: boolean;
  fromQuoteId: string | null;
  existingBookingId?: string | null;
  existingQuoteId?: string | null;
}

const nn = (s: string | null | undefined): string | null => (s ? s : null);

/**
 * Periodo de facturación para facturas ligadas a una reserva.
 * Si falta alguno de los extremos, se deriva del mes de la fecha de emisión
 * (mismo criterio que el pre-llenado del formulario), porque la BD prohíbe
 * guardar una factura con reserva y periodo nulo.
 * Regresión v7.423.0 (P3): este fallback ya no puede "colar" un mes ajeno a
 * la reserva — el schema exige ambos extremos cuando hay reserva y el RPC
 * transaccional rechaza en servidor cualquier periodo fuera de su rango.
 */
export function resolveBillingPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  issueDate: Date | null | undefined,
): { start: string; end: string } {
  if (start && end) return { start, end };
  const bounds = monthBounds(issueDate ?? nowMty());
  return { start: start || bounds.start, end: end || bounds.end };
}

function buildCfdiPayload(cfdi: CfdiFormValues) {
  const isGlobal = (cfdi.receptorRfc || "").toUpperCase() === "XAXX010101000";
  return {
    serie: nn(cfdi.serie),
    folio: nn(cfdi.folio),
    forma_pago: isGlobal ? "01" : nn(cfdi.formaPago),
    metodo_pago: isGlobal ? "PUE" : nn(cfdi.metodoPago),
    uso_cfdi: isGlobal ? "S01" : nn(cfdi.usoCfdi),
    moneda: nn(cfdi.moneda),
    tipo_cambio: cfdi.tipoCambio,
    receptor_rfc: nn(cfdi.receptorRfc),
    receptor_razon_social: isGlobal ? "PUBLICO EN GENERAL" : nn(cfdi.receptorRazonSocial),
    receptor_regimen_fiscal: isGlobal ? "616" : nn(cfdi.receptorRegimenFiscal),
    receptor_domicilio_fiscal_cp: nn(cfdi.receptorDomicilioFiscalCp),
    global_periodicity: isGlobal ? nn(cfdi.globalPeriodicity) : null,
    global_months: isGlobal ? nn(cfdi.globalMonths) : null,
    global_year: isGlobal ? (cfdi.globalYear ?? null) : null,
  };
}


interface UseInvoiceFormSubmitOpts {
  /**
   * v7.381.1: rechazo del guard de BD (p.ej. `trg_guard_invoice_sale_assignment`
   * por carrera/estado obsoleto) → bloque explicable en vez de toast genérico.
   */
  onBusinessBlock?: (block: BusinessBlock) => void;
}

/**
 * Regresión v7.423.0 (P1): el submit ya no encadena crear/actualizar + sync
 * en dos peticiones (eso podía dejar una factura sin sus reservas ligadas).
 * `saveInvoice` envía factura + bookingIds JUNTOS al RPC transaccional
 * `save_invoice_with_bookings`; el guard de venta y el resto de reglas de BD
 * se conservan (SECURITY INVOKER).
 */
export function useInvoiceFormSubmit(opts?: UseInvoiceFormSubmitOpts) {
  const saveInvoice = useSaveInvoiceWithBookings({ onBusinessBlock: opts?.onBusinessBlock });
  const updateQuote = useUpdateQuote();

  const buildPayload = ({ values, isEdit, fromQuoteId, existingBookingId, existingQuoteId }: BuildPayloadArgs) => {
    const { bookingIds, customerId, customerName, lineItems, taxRate, dueDate, issueDate, notes, cfdi } = values;
    const items = toLineItems(lineItems);
    const { subtotal, taxAmount, total } = computeTotals(items, taxRate);
    const primaryBookingId = bookingIds[0] || values.bookingId || (isEdit ? orEmpty(existingBookingId, null) : null) || null;
    // H-6: si la factura lleva reserva, enviamos el periodo; si no, va null.
    const hasBooking = !!primaryBookingId;
    // Red de seguridad: la BD rechaza (23514) cualquier factura con reserva y
    // periodo nulo. Si el formulario llega sin periodo (edición de facturas
    // viejas, o reserva ligada por código), lo derivamos del mes de emisión.
    const period = hasBooking
      ? resolveBillingPeriod(values.billingPeriodStart, values.billingPeriodEnd, issueDate)
      : { start: null, end: null };
    return {
      booking_id: primaryBookingId,
      customer_id: customerId || null,
      customer_name: nn(customerName),
      quote_id: fromQuoteId || (isEdit ? orEmpty(existingQuoteId, null) : null) || null,
      line_items: toJsonArray(items),
      subtotal: roundMoney(subtotal), tax_rate: taxRate, tax_amount: roundMoney(taxAmount), total: roundMoney(total),
      due_date: toYMD(dueDate) ?? null,
      issued_at: toYMD(issueDate) ?? "",
      billing_period_start: period.start,
      billing_period_end: period.end,
      notes: nn(notes),

      ...buildCfdiPayload(cfdi),
    };
  };

  return {
    saveInvoice, updateQuote,
    buildPayload,
    isPending: saveInvoice.isPending,
  };
}
