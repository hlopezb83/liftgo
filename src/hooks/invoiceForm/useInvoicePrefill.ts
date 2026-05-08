import { useEffect } from "react";
import { parseDateLocal, nowMty } from "@/lib/utils";
import type { CfdiLineItem } from "@/components/invoice-form/EditableLineItemsTable";
import type { useInvoiceFormState, CfdiFormState } from "./useInvoiceFormState";

type State = ReturnType<typeof useInvoiceFormState>;
type Customer = { id: string; name: string; rfc?: string | null; razon_social?: string | null; regimen_fiscal?: string | null; domicilio_fiscal_cp?: string | null; uso_cfdi?: string | null };

export function applyCustomerCfdi(customer: Customer, setCfdi: State["setCfdi"]) {
  setCfdi("receptorRfc", customer.rfc || "");
  setCfdi("receptorRazonSocial", customer.razon_social || customer.name || "");
  setCfdi("receptorRegimenFiscal", customer.regimen_fiscal || "");
  setCfdi("receptorDomicilioFiscalCp", customer.domicilio_fiscal_cp || "");
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
interface Props {
  existing: ExistingInvoice | null | undefined;
  sourceQuote: SourceQuote | null | undefined;
  assignments: Array<{ line_index: number; forklift_id: string }> | undefined;
  forklifts: Array<{ id: string; name: string; manufacturer?: string | null; model: string; serial_number?: string | null }> | undefined;
  customers: Customer[] | undefined;
  isEdit: boolean;
  state: State;
}

export function useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, state }: Props) {
  useEffect(() => {
    if (!existing) return;
    state.setCustomerName(existing.customer_name || "");
    state.setCustomerId(existing.customer_id);
    state.setBookingId(existing.booking_id || "");
    state.setLineItems((existing.line_items as CfdiLineItem[]) || []);
    state.setTaxRate(Number(existing.tax_rate) || 0);
    state.setDueDate(existing.due_date ? parseDateLocal(existing.due_date) : undefined);
    state.setIssueDate(existing.issued_at ? parseDateLocal(existing.issued_at) : nowMty());
    state.setNotes(existing.notes || "");
    state.setCfdiForm({
      serie: existing.serie || "",
      folio: existing.folio || "",
      formaPago: existing.forma_pago || "03",
      metodoPago: existing.metodo_pago || "PUE",
      usoCfdi: existing.uso_cfdi || "G03",
      moneda: existing.moneda || "MXN",
      tipoCambio: Number(existing.tipo_cambio) || 1,
      receptorRfc: existing.receptor_rfc || "",
      receptorRazonSocial: existing.receptor_razon_social || "",
      receptorRegimenFiscal: existing.receptor_regimen_fiscal || "",
      receptorDomicilioFiscalCp: existing.receptor_domicilio_fiscal_cp || "",
    } as CfdiFormState);
    if (existing.customer_id && !existing.receptor_rfc && customers) {
      const customer = customers.find((c) => c.id === existing.customer_id);
      if (customer) applyCustomerCfdi(customer, state.setCfdi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, customers]);

  useEffect(() => {
    if (!sourceQuote || isEdit) return;
    state.setCustomerName(sourceQuote.customer_name || "");
    state.setCustomerId(sourceQuote.customer_id);
    const quoteItems = (sourceQuote.line_items as CfdiLineItem[]) || [];
    const isSaleWithAssignments = sourceQuote.quote_type === "sale" && assignments && assignments.length > 0;
    state.setLineItems(quoteItems.map((item, index) => {
      const enriched: CfdiLineItem = {
        ...item,
        clave_prod_serv: item.clave_prod_serv || "78181500",
        clave_unidad: item.clave_unidad || "DAY",
        objeto_imp: item.objeto_imp || "02",
      };
      if (isSaleWithAssignments) {
        const assignment = assignments.find((a) => a.line_index === index);
        if (assignment) {
          const forklift = forklifts?.find((f) => f.id === assignment.forklift_id);
          if (forklift) {
            enriched.description = `${forklift.manufacturer || ""} ${forklift.model} — S/N: ${forklift.serial_number || "N/A"} (${forklift.name}) - Venta de equipo`;
          }
        }
      }
      return enriched;
    }));
    state.setTaxRate(Number(sourceQuote.tax_rate) || 16);
    state.setNotes(sourceQuote.notes || "");
    if (sourceQuote.customer_id && customers) {
      const customer = customers.find((c) => c.id === sourceQuote.customer_id);
      if (customer) applyCustomerCfdi(customer, state.setCfdi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);
}
