import { format } from "date-fns";
import { useCreateInvoice, useUpdateInvoice } from "@/features/invoices/hooks/invoices/useInvoices";
import { useUpdateQuote } from "@/features/quotes/hooks/quotes/useQuotes";
import { computeTotals, type LineItem } from "@/lib/domain/invoiceHelpers";
import { toJsonArray } from "@/lib/lineItems";
import { orEmpty } from "@/lib/coerce";
import type { InvoiceFormValues, CfdiFormValues, LineItemValues } from "@/features/invoices/lib/invoiceFormSchema";

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

function buildCfdiPayload(cfdi: CfdiFormValues) {
  return {
    serie: nn(cfdi.serie),
    folio: nn(cfdi.folio),
    forma_pago: nn(cfdi.formaPago),
    metodo_pago: nn(cfdi.metodoPago),
    uso_cfdi: nn(cfdi.usoCfdi),
    moneda: nn(cfdi.moneda),
    tipo_cambio: cfdi.tipoCambio,
    receptor_rfc: nn(cfdi.receptorRfc),
    receptor_razon_social: nn(cfdi.receptorRazonSocial),
    receptor_regimen_fiscal: nn(cfdi.receptorRegimenFiscal),
    receptor_domicilio_fiscal_cp: nn(cfdi.receptorDomicilioFiscalCp),
  };
}

export function useInvoiceFormSubmit() {
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const updateQuote = useUpdateQuote();

  const buildPayload = ({ values, isEdit, fromQuoteId, existingBookingId, existingQuoteId }: BuildPayloadArgs) => {
    const { bookingId, customerId, customerName, lineItems, taxRate, dueDate, issueDate, notes, cfdi } = values;
    const items = toLineItems(lineItems);
    const { subtotal, taxAmount, total } = computeTotals(items, taxRate);
    return {
      booking_id: bookingId || (isEdit ? orEmpty(existingBookingId, null) : null) || null,
      customer_id: customerId,
      customer_name: nn(customerName),
      quote_id: fromQuoteId || (isEdit ? orEmpty(existingQuoteId, null) : null) || null,
      line_items: toJsonArray(items),
      subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      issued_at: format(issueDate, "yyyy-MM-dd"),
      notes: nn(notes),
      ...buildCfdiPayload(cfdi),
    };
  };

  return {
    createInvoice, updateInvoice, updateQuote,
    buildPayload,
    isPending: createInvoice.isPending || updateInvoice.isPending,
  };
}
