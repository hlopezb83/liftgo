import { useEffect, useEffectEvent, useRef, useState } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import {
  buildFromInvoice, buildFromQuote, cfdiFromCustomer,
  type Customer, type ExistingInvoice, type SourceQuote, type Forklift, type Assignment,
} from "./invoiceFormBuilders";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { QuoteChargeAvailability } from "../../lib/quoteChargeAvailability";
import type { UseFormReturn } from "react-hook-form";
interface Props {
  chargeAvailability?: QuoteChargeAvailability;
  existing: (ExistingInvoice & { id: string }) | null | undefined;
  sourceQuote: SourceQuote | null | undefined;
  assignments: Assignment[] | undefined;
  forklifts: Forklift[] | undefined;
  customers: Customer[] | undefined;
  isEdit: boolean;
  form: UseFormReturn<InvoiceFormValues>;
  existingBookingIds?: string[];
}

// Receiver fields eligible for customer fallback. A saved RFC freezes the whole
// initial fiscal snapshot, including blanks; a catalog-derived RFC does not.
const CUSTOMER_FISCAL_FIELDS = [
  ["receptorRfc", "receptor_rfc"],
  ["receptorRazonSocial", "receptor_razon_social"],
  ["receptorRegimenFiscal", "receptor_regimen_fiscal"],
  ["receptorDomicilioFiscalCp", "receptor_domicilio_fiscal_cp"],
  ["usoCfdi", "uso_cfdi"],
] as const;
type CustomerFiscalField = (typeof CUSTOMER_FISCAL_FIELDS)[number][0];
interface InvoiceHydration {
  id: string;
  customerId: string | null;
  protectedFields: Set<CustomerFiscalField>;
  automaticValues: Partial<Record<CustomerFiscalField, string>>;
}

function initialInvoiceHydration(
  existing: ExistingInvoice & { id: string },
  values: InvoiceFormValues,
): InvoiceHydration {
  const protectedFields = new Set<CustomerFiscalField>();
  const automaticValues: InvoiceHydration["automaticValues"] = {};
  for (const [field, snapshotField] of CUSTOMER_FISCAL_FIELDS) {
    if (existing.receptor_rfc || existing[snapshotField]) protectedFields.add(field);
    else automaticValues[field] = values.cfdi[field];
  }
  // Capture protection and the original empty/default values once per document.
  // A refetch must not reinterpret saved fields as customer-owned fields.
  return { id: existing.id, customerId: existing.customer_id, protectedFields, automaticValues };
}

function hydrateCustomerFiscalFields(
  hydration: InvoiceHydration,
  customer: Customer,
  form: UseFormReturn<InvoiceFormValues>,
  values: InvoiceFormValues | undefined,
) {
  const fallback = cfdiFromCustomer(customer);
  for (const [field] of CUSTOMER_FISCAL_FIELDS) {
    const value = fallback[field];
    if (hydration.protectedFields.has(field) || value == null) continue;
    if (values) {
      values.cfdi[field] = value;
      hydration.automaticValues[field] = value;
    } else {
      const path = `cfdi.${field}` as const;
      const state = form.getFieldState(path);
      if (!state.isDirty && !state.isTouched
        && form.getValues(path) === hydration.automaticValues[field]) {
        form.setValue(path, value, { shouldDirty: false });
        hydration.automaticValues[field] = value;
      }
    }
  }
}

export function useInvoicePrefill({
  existing, sourceQuote, assignments, forklifts, customers, isEdit, form, existingBookingIds, chargeAvailability,
}: Props) {
  const prefilledQuote = useRef<string | undefined>(undefined);
  const [quoteChargePrefillError, setQuoteChargePrefillError] = useState<string | null>(null);
  const invoiceHydration = useRef<InvoiceHydration | null>(null);
  const invoiceId = existing?.id;
  const customer = customers?.find((candidate) => candidate.id === existing?.customer_id);
  // Explicit domain fingerprint, not the array's length or an object serializer.
  // Unrelated customer refetches must not reset an in-progress invoice.
  const customerFiscalKey = JSON.stringify([
    customer?.id, customer?.name, customer?.rfc, customer?.razon_social,
    customer?.regimen_fiscal, customer?.domicilio_fiscal_cp, customer?.uso_cfdi,
  ]);
  const hydrateInvoice = useEffectEvent(() => {
    if (!existing) return;
    const initial = invoiceHydration.current?.id !== existing.id;
    const values = initial ? buildFromInvoice(existing, undefined) : undefined;
    if (values) invoiceHydration.current = initialInvoiceHydration(existing, values);
    const hydration = invoiceHydration.current;
    if (!hydration) return;
    if (customer && customer.id === hydration.customerId
      && (initial || form.getValues("customerId") === hydration.customerId)) {
      hydrateCustomerFiscalFields(hydration, customer, form, values);
    }
    // A full reset is only for initial loading or a different document. Refetches
    // must not replace draft rows/notes, fiscal snapshots or the optimistic version.
    if (values) form.reset(values);
  });
  useEffect(() => {
    hydrateInvoice();
  }, [invoiceId, existing?.customer_id, existing?.receptor_rfc, customerFiscalKey]);

  // Hydrate bookingIds from pivot table once it loads.
  // `hydrate` es useEffectEvent → lee el `form` fresco y sólo re-dispara al
  // cambiar el booking activo o la lista de pivots (key primitivo).
  const hydrate = useEffectEvent(() => {
    if (!existing || !existingBookingIds || existingBookingIds.length === 0) return;
    form.setValue("bookingIds", existingBookingIds, { shouldDirty: false });
    if (!form.getValues("bookingId")) {
      form.setValue("bookingId", existingBookingIds[0] ?? "", { shouldDirty: false });
    }
  });
  const bookingIdsKey = existingBookingIds?.join(",") ?? "";
  useEffect(() => {
    hydrate();
  }, [invoiceId, existing?.booking_id, bookingIdsKey]);

  usePrefillEffect(() => {
    if (!sourceQuote || isEdit || !customers || !forklifts
      || (sourceQuote.quote_type === "sale" && !assignments)
      || (sourceQuote.id && !chargeAvailability)) return;
    if (sourceQuote.id && prefilledQuote.current === sourceQuote.id) return;
    try {
      const values = buildFromQuote({ q: sourceQuote, assignments, forklifts, customers, chargeAvailability });
      const enteredLines = form.getValues("lineItems").map((line) => ({ ...line }));
      form.reset(values, { keepDirtyValues: true });
      // RHF merges dirty arrays by index. A manual row entered while the RPC
      // was pending must never acquire the hidden identity of a quote row.
      if (enteredLines.length) {
        form.setValue("lineItems", [...values.lineItems, ...enteredLines], { shouldDirty: true });
      }
      prefilledQuote.current = sourceQuote.id;
      setQuoteChargePrefillError(null);
    } catch (error) {
      setQuoteChargePrefillError(error instanceof Error ? error.message : "No se pudieron verificar los cargos de la cotización.");
    }
  }, [sourceQuote, customers, isEdit, assignments, forklifts, chargeAvailability]);
  return { quoteChargePrefillError };
}
