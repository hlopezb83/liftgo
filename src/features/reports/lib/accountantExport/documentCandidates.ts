import type { ExportData, ExportSheet, SupplierPayment } from "./model";
export type DocumentKind = "Factura" | "Nota de crédito" | "REP cobro" | "Compra" | "REP proveedor";
export interface DocumentCandidate {
  kind: DocumentKind; id: string; folio: string; uuid: string | null; extension: "xml" | "pdf";
  bucket: "cfdi-files" | "supplier-bill-cfdi-xml"; source: string | null; inlineXml?: string | null;
  scope: "Periodo" | "Referencia fuera del periodo";
}

function selected(id: string, key: string, seen: Set<string>, period: Set<string>, references: Set<string>) {
  return !seen.has(key) && (period.has(id) || references.has(id));
}
function hasSupplierRep(row: SupplierPayment) {
  return Boolean(row.rep_cfdi_uuid || row.rep_xml_url || row.rep_pdf_url || row.rep_required);
}

/** Select from the actual workbook rows, never from the unfiltered raw query. */
export function documentCandidates(data: ExportData, sheets: ExportSheet[]): DocumentCandidate[] {
  const rows = (name: string) => sheets.find((s) => s.name === name)?.rows ?? [];
  const ids = (name: string, field = "ID") => new Set(rows(name).map((r) => String(r[field])));
  const references = rows("Referencias");
  const invoiceIds = ids("Ventas"), billIds = ids("Compras");
  const creditIds = ids("Notas de crédito"), paymentIds = ids("REP asociados a cobros", "Cobro ID"), supplierPaymentIds = ids("Pagos proveedores");
  const invoiceRefs = new Set(references.filter((r) => r.Tipo === "Factura").map((r) => String(r.ID)));
  const billRefs = new Set(references.filter((r) => r.Tipo === "Proveedor").map((r) => String(r.ID)));
  const out: DocumentCandidate[] = [];
  const add = (base: Omit<DocumentCandidate, "extension" | "source" | "inlineXml">, xml: string | null | undefined, pdf: string | null | undefined, inlineXml?: string | null) => {
    out.push({ ...base, extension: "xml", source: xml ?? null, inlineXml }, { ...base, extension: "pdf", source: pdf ?? null });
  };
  const seen = new Set<string>();
  for (const row of [...data.invoices, ...data.invoiceReferences]) {
    if (!selected(row.id, `i:${row.id}`, seen, invoiceIds, invoiceRefs)) continue;
    seen.add(`i:${row.id}`);
    add({ kind: "Factura", id: row.id, folio: row.invoice_number, uuid: row.cfdi_uuid, bucket: "cfdi-files", scope: invoiceIds.has(row.id) ? "Periodo" : "Referencia fuera del periodo" }, row.cfdi_xml_url, row.cfdi_pdf_url, row.cfdi_xml);
  }
  for (const row of data.credits.filter((r) => creditIds.has(r.id)))
    add({ kind: "Nota de crédito", id: row.id, folio: row.credit_note_number, uuid: row.cfdi_uuid, bucket: "cfdi-files", scope: "Periodo" }, row.cfdi_xml_url, row.cfdi_pdf_url);
  for (const row of data.payments.filter((r) => paymentIds.has(r.id)))
    add({ kind: "REP cobro", id: row.id, folio: row.rep_number ?? row.rep_folio ?? row.id, uuid: row.rep_cfdi_uuid, bucket: "cfdi-files", scope: "Periodo" }, row.rep_xml_url, row.rep_pdf_url);
  for (const row of [...data.bills, ...data.billReferences]) {
    if (!selected(row.id, `b:${row.id}`, seen, billIds, billRefs)) continue;
    seen.add(`b:${row.id}`);
    // Unknown legacy buckets/prefixes are explicitly unverifiable, never fetched.
    add({ kind: "Compra", id: row.id, folio: row.bill_number, uuid: row.cfdi_uuid, bucket: "supplier-bill-cfdi-xml", scope: billIds.has(row.id) ? "Periodo" : "Referencia fuera del periodo" }, row.cfdi_xml_url ?? row.xml_url, row.pdf_url);
  }
  for (const row of data.supplierPayments.filter((r) => supplierPaymentIds.has(r.id))) {
    if (!hasSupplierRep(row)) continue;
    add({ kind: "REP proveedor", id: row.id, folio: row.id, uuid: row.rep_cfdi_uuid, bucket: "cfdi-files", scope: "Periodo" }, row.rep_xml_url, row.rep_pdf_url);
  }
  return out;
}
