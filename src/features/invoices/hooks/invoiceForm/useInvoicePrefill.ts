import { useEffect } from "react";
import { parseDateLocal, nowMty } from "@/lib/utils";
import { toStr } from "@/lib/forms/coerce";
import type { CfdiLineItem } from "@/features/invoices/components/invoice-form/EditableLineItemsTable";
import type { useInvoiceFormState, CfdiFormState } from "./useInvoiceFormState";

type State = ReturnType<typeof useInvoiceFormState>;
type Customer = { id: string; name: string; rfc?: string | null; razon_social?: string | null; regimen_fiscal?: string | null; domicilio_fiscal_cp?: string | null; uso_cfdi?: string | null };

export function applyCustomerCfdi(customer: Customer, setCfdi: State["setCfdi"]) {
  setCfdi("receptorRfc", toStr(customer.rfc));
  setCfdi("receptorRazonSocial", customer.razon_social || customer.name || "");
  setCfdi("receptorRegimenFiscal", toStr(customer.regimen_fiscal));
  setCfdi("receptorDomicilioFiscalCp", toStr(customer.domicilio_fiscal_cp));
  if (customer.uso_cfdi) setCfdi("usoCfdi", customer.uso_cfdi);
}

type ExistingInvoice = {
  customer_name?: string | null; customer_id: string; booking_id?: string | null;
  line_items?: unknown; tax_rate?: number | string; due_date?: string | null;
  issued_at?: string | null; notes?: string | null;
  serie?: string | null; folio?: string | null; forma_pago?: string | null;
  metodo_pago?: string | null; uso_cfdi?: string | null; moneda?: string | null;
  tipo_cambio?: number | string | null; receptor_rfc?: string | null;
  receptor_razon_social?: string | null; receptor_regimen_fiscal?: string | null;
  receptor_domicilio_fiscal_cp?: string | null;
};
type SourceQuote = {
  customer_name?: string | null; customer_id: string;
  line_items?: unknown; tax_rate?: number | string; notes?: string | null;
  quote_type?: string;
};
type Forklift = { id: string; name: string; manufacturer?: string | null; model: string; serial_number?: string | null };

interface Props {
  existing: ExistingInvoice | null | undefined;
  sourceQuote: SourceQuote | null | undefined;
  assignments: Array<{ line_index: number; forklift_id: string }> | undefined;
  forklifts: Forklift[] | undefined;
  customers: Customer[] | undefined;
  isEdit: boolean;
  state: State;
}

function buildCfdiFromInvoice(inv: ExistingInvoice): CfdiFormState {
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

function applyInvoiceToState(inv: ExistingInvoice, state: State) {
  state.setCustomerName(toStr(inv.customer_name));
  state.setCustomerId(inv.customer_id);
  state.setBookingId(toStr(inv.booking_id));
  state.setLineItems((inv.line_items as CfdiLineItem[]) || []);
  state.setTaxRate(Number(inv.tax_rate) || 0);
  state.setDueDate(inv.due_date ? parseDateLocal(inv.due_date) : undefined);
  state.setIssueDate(inv.issued_at ? parseDateLocal(inv.issued_at) : nowMty());
  state.setNotes(toStr(inv.notes));
  state.setCfdiForm(buildCfdiFromInvoice(inv));
}

function enrichLineItem(item: CfdiLineItem, index: number, isSaleWithAssignments: boolean,
  assignments: Props["assignments"], forklifts: Forklift[] | undefined): CfdiLineItem {
  const enriched: CfdiLineItem = {
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

function applyQuoteToState(q: SourceQuote, state: State, assignments: Props["assignments"], forklifts: Forklift[] | undefined) {
  state.setCustomerName(toStr(q.customer_name));
  state.setCustomerId(q.customer_id);
  const quoteItems = (q.line_items as CfdiLineItem[]) || [];
  const isSaleWithAssignments = q.quote_type === "sale" && !!assignments && assignments.length > 0;
  state.setLineItems(quoteItems.map((item, i) => enrichLineItem(item, i, isSaleWithAssignments, assignments, forklifts)));
  state.setTaxRate(Number(q.tax_rate) || 16);
  state.setNotes(toStr(q.notes));
}

export function useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, state }: Props) {
  useEffect(() => {
    if (!existing) return;
    applyInvoiceToState(existing, state);
    if (existing.customer_id && !existing.receptor_rfc && customers) {
      const customer = customers.find((c) => c.id === existing.customer_id);
      if (customer) applyCustomerCfdi(customer, state.setCfdi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, customers]);

  useEffect(() => {
    if (!sourceQuote || isEdit) return;
    applyQuoteToState(sourceQuote, state, assignments, forklifts);
    if (sourceQuote.customer_id && customers) {
      const customer = customers.find((c) => c.id === sourceQuote.customer_id);
      if (customer) applyCustomerCfdi(customer, state.setCfdi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);
}
