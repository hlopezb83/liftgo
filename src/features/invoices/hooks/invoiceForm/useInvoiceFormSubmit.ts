import { format } from "date-fns";
import { useCreateInvoice, useUpdateInvoice } from "@/hooks/useInvoices";
import { useUpdateQuote } from "@/hooks/useQuotes";
import { computeTotals } from "@/features/invoices/lib/invoiceUtils";
import { toJsonArray } from "@/lib/lineItems";
import type { useInvoiceFormState } from "./useInvoiceFormState";

type State = ReturnType<typeof useInvoiceFormState>;

interface BuildPayloadArgs {
  state: State;
  isEdit: boolean;
  fromQuoteId: string | null;
  existingBookingId?: string | null;
  existingQuoteId?: string | null;
}

export function useInvoiceFormSubmit() {
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const updateQuote = useUpdateQuote();

  const buildPayload = ({ state, isEdit, fromQuoteId, existingBookingId, existingQuoteId }: BuildPayloadArgs) => {
    const { bookingId, customerId, customerName, lineItems, taxRate, dueDate, issueDate, notes, cfdi } = state;
    const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
    return {
      booking_id: bookingId || (isEdit ? existingBookingId : null) || null,
      customer_id: customerId,
      customer_name: customerName || null,
      quote_id: fromQuoteId || (isEdit ? existingQuoteId : null) || null,
      line_items: toJsonArray(lineItems),
      subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      issued_at: format(issueDate, "yyyy-MM-dd"),
      notes: notes || null,
      serie: cfdi.serie || null, folio: cfdi.folio || null, forma_pago: cfdi.formaPago || null,
      metodo_pago: cfdi.metodoPago || null, uso_cfdi: cfdi.usoCfdi || null, moneda: cfdi.moneda || null,
      tipo_cambio: cfdi.tipoCambio, receptor_rfc: cfdi.receptorRfc || null,
      receptor_razon_social: cfdi.receptorRazonSocial || null, receptor_regimen_fiscal: cfdi.receptorRegimenFiscal || null,
      receptor_domicilio_fiscal_cp: cfdi.receptorDomicilioFiscalCp || null,
    };
  };

  return {
    createInvoice, updateInvoice, updateQuote,
    buildPayload,
    isPending: createInvoice.isPending || updateInvoice.isPending,
  };
}
