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
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (error || !invoice) throw new Error("Factura no encontrada");

  const { customerRfc, customerCp } = await resolveCustomerFiscal(invoice);
  return { invoice, customerRfc, customerCp };
}
