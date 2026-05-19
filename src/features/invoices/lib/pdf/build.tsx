import { supabase } from "@/integrations/supabase/client";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdf/shared";
import { parseLineItems } from "@/lib/lineItems";

async function resolveCustomerFiscal(invoice: { customer_id: string | null; receptor_rfc: string | null }) {
  let customerRfc: string | null = null;
  let customerCp: string | null = null;
  if (invoice.customer_id) {
    const { data: cust } = await supabase
      .from("customers").select("rfc, domicilio_fiscal_cp").eq("id", invoice.customer_id).single();
    if (cust) { customerRfc = cust.rfc; customerCp = cust.domicilio_fiscal_cp; }
  }
  if (!customerRfc && invoice.receptor_rfc) customerRfc = invoice.receptor_rfc;
  return { customerRfc, customerCp };
}

export async function buildInvoicePdf(invoiceId: string): Promise<void> {
  const { data: invoice, error } = await supabase
    .from("invoices").select("*").eq("id", invoiceId).single();
  if (error || !invoice) throw new Error("Factura no encontrada");

  const { company, logoBase64 } = await fetchCompanyDataAndLogo();
  const { customerRfc, customerCp } = await resolveCustomerFiscal(invoice);

  const invoiceLabel = invoice.serie && invoice.folio
    ? `${invoice.serie}-${invoice.folio}`
    : invoice.invoice_number;

  const lineItems = parseLineItems<PdfLineItem>(invoice.line_items);
  const currency = invoice.moneda || "MXN";

  const [{ pdf }, { saveAs }, { InvoiceDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("file-saver"),
    import("@/lib/pdf/documents/InvoiceDocument"),
  ]);

  const blob = await pdf(
    <InvoiceDocument
      company={company}
      logoBase64={logoBase64}
      invoiceLabel={invoiceLabel}
      customerName={invoice.customer_name}
      customerRfc={customerRfc}
      customerCp={customerCp}
      issuedAt={invoice.issued_at}
      dueDate={invoice.due_date}
      status={invoice.status}
      formaPago={invoice.forma_pago}
      metodoPago={invoice.metodo_pago}
      cfdiStatus={invoice.cfdi_status}
      cfdiUuid={invoice.cfdi_uuid}
      lineItems={lineItems}
      subtotal={Number(invoice.subtotal)}
      taxRate={Number(invoice.tax_rate)}
      taxAmount={Number(invoice.tax_amount)}
      total={Number(invoice.total)}
      currency={currency}
      notes={invoice.notes ? String(invoice.notes) : null}
    />
  ).toBlob();
  saveAs(blob, `${invoice.invoice_number}.pdf`);
}
