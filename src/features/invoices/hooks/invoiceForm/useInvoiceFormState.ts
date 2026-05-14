import { useState } from "react";
import { useFormState } from "@/hooks/useFormState";
import { nowMty } from "@/lib/utils";
import type { CfdiLineItem } from "@/features/invoices/components/invoice-form/EditableLineItemsTable";

export const INITIAL_CFDI = {
  serie: "",
  folio: "",
  formaPago: "03",
  metodoPago: "PUE",
  usoCfdi: "G03",
  moneda: "MXN",
  tipoCambio: 1 as number,
  receptorRfc: "",
  receptorRazonSocial: "",
  receptorRegimenFiscal: "",
  receptorDomicilioFiscalCp: "",
};

export type CfdiFormState = typeof INITIAL_CFDI;

export function useInvoiceFormState() {
  const [bookingId, setBookingId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<CfdiLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(16);
  const [dueDate, setDueDate] = useState<Date>();
  const [issueDate, setIssueDate] = useState<Date>(nowMty());
  const [notes, setNotes] = useState("");
  const { form: cfdi, set: setCfdi, setForm: setCfdiForm } = useFormState(INITIAL_CFDI);

  return {
    bookingId, setBookingId,
    customerName, setCustomerName,
    customerId, setCustomerId,
    lineItems, setLineItems,
    taxRate, setTaxRate,
    dueDate, setDueDate,
    issueDate, setIssueDate,
    notes, setNotes,
    cfdi, setCfdi, setCfdiForm,
  };
}
