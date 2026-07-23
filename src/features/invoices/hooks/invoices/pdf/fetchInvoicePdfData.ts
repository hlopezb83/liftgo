/**
 * Acceso a datos para la generación de PDF de facturas.
 *
 * Aísla las llamadas a Supabase fuera de `lib/pdf/build.tsx`, que ahora
 * recibe un payload tipado y se enfoca únicamente en renderizar el documento.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export interface InvoicePdfPayload {
  invoice: Tables<"invoices">;
  customerRfc: string | null;
  customerCp: string | null;
}

async function resolveCustomerFiscal(invoice: {
  customer_id: string | null;
  receptor_rfc: string | null;
}): Promise<{ customerRfc: string | null; customerCp: string | null }> {
  let customerRfc: string | null = null;
  let customerCp: string | null = null;

  if (invoice.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("rfc, domicilio_fiscal_cp")
      .eq("id", invoice.customer_id)
      .single();
    if (cust) {
      customerRfc = cust.rfc;
      customerCp = cust.domicilio_fiscal_cp;
    }
  }
  if (!customerRfc && invoice.receptor_rfc) customerRfc = invoice.receptor_rfc;
  return { customerRfc, customerCp };
}

export async function fetchInvoicePdfData(invoiceId: string): Promise<InvoicePdfPayload> {
  // v7.216.0 (C6): columnas explícitas; el PDF consume prácticamente toda la fila.
  const INVOICE_PDF_COLUMNS =
    "id, invoice_number, folio, serie, customer_id, customer_name, booking_id, quote_id, " +
    "status, cfdi_status, cfdi_uuid, cfdi_pdf_url, cfdi_xml_url, cfdi_xml, cfdi_error_message, " +
    "cancellation_status, cancellation_motive, cancellation_reason, cancelled_at, substitution_uuid, " +
    "acuse_pdf_url, acuse_xml_url, facturapi_invoice_id, facturapi_env, stamping_attempts, " +
    "stamp_variance, stamp_variance_checked_at, invoice_type, forma_pago, metodo_pago, uso_cfdi, " +
    "moneda, tipo_cambio, global_months, global_periodicity, global_year, " +
    "receptor_rfc, receptor_razon_social, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, " +
    "line_items, subtotal, tax_rate, tax_amount, total, notes, version, " +
    "billing_period_start, billing_period_end, issued_at, due_date, paid_at, " +
    "e2e_scope, is_e2e, created_at, updated_at";
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(INVOICE_PDF_COLUMNS)
    .eq("id", invoiceId)
    .single()
    .returns<Tables<"invoices">>();
  if (error || !invoice) throw new Error("Factura no encontrada");

  const { customerRfc, customerCp } = await resolveCustomerFiscal(invoice);
  return { invoice, customerRfc, customerCp };
}
