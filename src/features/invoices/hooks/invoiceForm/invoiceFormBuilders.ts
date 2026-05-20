import { parseDateLocal, nowMty } from "@/lib/utils";
import { toStr } from "@/lib/forms/coerce";
import {
  type InvoiceFormValues,
  type CfdiFormValues,
  type LineItemValues,
  EMPTY_CFDI,
} from "@/lib/schemas/invoiceFormSchema";

export type Customer = {
  id: string; name: string;
  rfc?: string | null; razon_social?: string | null;
  regimen_fiscal?: string | null; domicilio_fiscal_cp?: string | null; uso_cfdi?: string | null;
};

export type ExistingInvoice = {
  customer_name?: string | null; customer_id: string; booking_id?: string | null;
  line_items?: unknown; tax_rate?: number | string; due_date?: string | null;
  issued_at?: string | null; notes?: string | null;
  serie?: string | null; folio?: string | null; forma_pago?: string | null;
  metodo_pago?: string | null; uso_cfdi?: string | null; moneda?: string | null;
  tipo_cambio?: number | string | null; receptor_rfc?: string | null;
  receptor_razon_social?: string | null; receptor_regimen_fiscal?: string | null;
  receptor_domicilio_fiscal_cp?: string | null;
};

export type SourceQuote = {
  customer_name?: string | null; customer_id: string;
  line_items?: unknown; tax_rate?: number | string; notes?: string | null;
  quote_type?: string;
};

export type Forklift = { id: string; name: string; manufacturer?: string | null; model: string; serial_number?: string | null };
export type Assignment = { line_index: number; forklift_id: string };

export function cfdiFromCustomer(customer: Customer): Partial<CfdiFormValues> {
  const patch: Partial<CfdiFormValues> = {
    receptorRfc: toStr(customer.rfc),
    receptorRazonSocial: customer.razon_social || customer.name || "",
    receptorRegimenFiscal: toStr(customer.regimen_fiscal),
    receptorDomicilioFiscalCp: toStr(customer.domicilio_fiscal_cp),
  };
  if (customer.uso_cfdi) patch.usoCfdi = customer.uso_cfdi;
  return patch;
}

function cfdiFromInvoice(inv: ExistingInvoice): CfdiFormValues {
  return {
    serie: toStr(inv.serie),
    folio: toStr(inv.folio),
    formaPago: toStr(inv.forma_pago, "03"),
    metodoPago: toStr(inv.metodo_pago, "PUE"),
    usoCfdi: toStr(inv.uso_cfdi, "G03"),
    moneda: toStr(inv.moneda, "MXN"),
    tipoCambio: Number(inv.tipo_cambio) || 1,
    receptorRfc: toStr(inv.receptor_rfc),
    receptorRazonSocial: toStr(inv.receptor_razon_social),
    receptorRegimenFiscal: toStr(inv.receptor_regimen_fiscal),
    receptorDomicilioFiscalCp: toStr(inv.receptor_domicilio_fiscal_cp),
  };
}

function enrichLineItem(
  item: LineItemValues,
  index: number,
  isSaleWithAssignments: boolean,
  assignments: Assignment[] | undefined,
  forklifts: Forklift[] | undefined,
): LineItemValues {
  const enriched: LineItemValues = {
    ...item,
    clave_prod_serv: item.clave_prod_serv || "78181500",
    clave_unidad: item.clave_unidad || "DAY",
    objeto_imp: item.objeto_imp || "02",
  };
  if (!isSaleWithAssignments) return enriched;
  const assignment = assignments?.find((a) => a.line_index === index);
  const forklift = assignment ? forklifts?.find((f) => f.id === assignment.forklift_id) : undefined;
  if (forklift) {
    enriched.description = `${forklift.manufacturer || ""} ${forklift.model} — S/N: ${forklift.serial_number || "N/A"} (${forklift.name}) - Venta de equipo`;
  }
  return enriched;
}

export function buildFromInvoice(inv: ExistingInvoice, customers: Customer[] | undefined): InvoiceFormValues {
  const cfdi = cfdiFromInvoice(inv);
  if (inv.customer_id && !inv.receptor_rfc && customers) {
    const c = customers.find((x) => x.id === inv.customer_id);
    if (c) Object.assign(cfdi, cfdiFromCustomer(c));
  }
  return {
    bookingId: toStr(inv.booking_id),
    customerId: inv.customer_id,
    customerName: toStr(inv.customer_name),
    lineItems: (inv.line_items as LineItemValues[]) || [],
    taxRate: Number(inv.tax_rate) || 0,
    dueDate: inv.due_date ? parseDateLocal(inv.due_date) : undefined,
    issueDate: inv.issued_at ? parseDateLocal(inv.issued_at) : nowMty(),
    notes: toStr(inv.notes),
    cfdi,
  };
}

interface FromQuoteArgs {
  q: SourceQuote;
  assignments: Assignment[] | undefined;
  forklifts: Forklift[] | undefined;
  customers: Customer[] | undefined;
}

export function buildFromQuote({ q, assignments, forklifts, customers }: FromQuoteArgs): InvoiceFormValues {
  const cfdi: CfdiFormValues = { ...EMPTY_CFDI };
  if (q.customer_id && customers) {
    const c = customers.find((x) => x.id === q.customer_id);
    if (c) Object.assign(cfdi, cfdiFromCustomer(c));
  }
  const items = (q.line_items as LineItemValues[]) || [];
  const isSaleWithAssignments = q.quote_type === "sale" && !!assignments && assignments.length > 0;
  return {
    bookingId: "",
    customerId: q.customer_id,
    customerName: toStr(q.customer_name),
    lineItems: items.map((item, i) => enrichLineItem(item, i, isSaleWithAssignments, assignments, forklifts)),
    taxRate: Number(q.tax_rate) || 16,
    dueDate: undefined,
    issueDate: nowMty(),
    notes: toStr(q.notes),
    cfdi,
  };
}
