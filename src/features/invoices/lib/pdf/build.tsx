import { parseLineItems } from "@/lib/domain/lineItems";
import { InvoiceDocument } from "@/lib/pdf/documents/InvoiceDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdf/shared";
import type { InvoicePdfPayload } from "@/features/invoices/hooks/invoices/pdf/fetchInvoicePdfData";

/**
 * Renderiza y descarga el PDF de una factura a partir de un payload ya
 * resuelto (factura + datos fiscales del cliente).
 *
 * La obtención de datos vive en `features/invoices/hooks/invoices/pdf/fetchInvoicePdfData.ts`
 * para mantener este módulo como pura capa de presentación / renderizado.
 */
export async function buildInvoicePdf(payload: InvoicePdfPayload): Promise<void> {
  const { invoice, customerRfc, customerCp } = payload;

  const { company, logoBase64 } = await fetchCompanyDataAndLogo();

  const invoiceLabel = invoice.serie && invoice.folio
    ? `${invoice.serie}-${invoice.folio}`
    : invoice.invoice_number;

  const lineItems = parseLineItems<PdfLineItem>(invoice.line_items);
  const currency = invoice.moneda || "MXN";

  await renderAndSave(
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
    />,
    `${invoice.invoice_number}.pdf`,
  );
}
