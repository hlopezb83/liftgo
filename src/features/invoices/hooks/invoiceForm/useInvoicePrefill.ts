import { useEffect, useEffectEvent, useRef, useState } from "react";
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
  sourceQuote: (SourceQuote & { version?: number }) | null | undefined;
  requestedQuoteId?: string | null;
  /** An extension or damage supplies the actual billed lines and receiver. */
  hasOtherPrefill?: boolean;
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

interface QuoteSnapshot { id: string; version: number | null }
function captureQuoteSnapshot(quote: Props["sourceQuote"]): QuoteSnapshot | null {
  return quote?.id ? { id: quote.id, version: quote.version ?? null } : null;
}
function snapshotVersion(snapshot: QuoteSnapshot | null, quote: Props["sourceQuote"], isEdit: boolean) {
  if (isEdit || !snapshot || snapshot.id !== quote?.id) return null;
  return snapshot.version;
}

function changesQuoteReceiverOrPeriod(name: string) {
  return ["customerId", "customerName", "taxRate", "bookingId", "bookingIds", "billingPeriodStart", "billingPeriodEnd", "cfdi"].includes(name)
    || name.startsWith("cfdi.") || name.startsWith("bookingIds.");
}

function applyQuoteDraft(form: Props["form"], values: InvoiceFormValues, edits: Set<string>) {
  const entered = form.getValues();
  const enteredLines = [...edits].some((name) => name === "lineItems" || name.startsWith("lineItems."))
    ? entered.lineItems.map((line) => ({ ...line })) : [];
  form.reset(values);
  for (const name of ["notes", "issueDate", "dueDate"] as const) {
    if (edits.has(name)) form.setValue(name, entered[name], { shouldDirty: true });
  }
  // Keep manual rows separate from the quote rows that carry fiscal source IDs.
  if (enteredLines.length) form.setValue("lineItems", [...values.lineItems, ...enteredLines], { shouldDirty: true });
}

function assertQuoteEquipment(quote: SourceQuote, assignments: Assignment[] | undefined, forklifts: Forklift[]) {
  if (quote.quote_type !== "sale") return;
  const equipment = new Set(forklifts.map((forklift) => forklift.id));
  if (assignments?.some((assignment) => !equipment.has(assignment.forklift_id))) {
    throw new Error("No se pudieron verificar los equipos asignados a la cotización. Reintenta la consulta.");
  }
}

function useExistingInvoiceHydration({ existing, customers, form, existingBookingIds }: Pick<Props, "existing" | "customers" | "form" | "existingBookingIds">) {
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
}

function matchesRequestedQuote(quote: Props["sourceQuote"], id: string | undefined, availability: Props["chargeAvailability"]): quote is NonNullable<Props["sourceQuote"]> {
  return !!quote && (!id || quote.id === id) && (!quote.id || !!availability);
}

export function useInvoicePrefill(props: Props) {
  useExistingInvoiceHydration(props);
  const { sourceQuote, requestedQuoteId, hasOtherPrefill, assignments, forklifts, customers, isEdit, form, chargeAvailability } = props;
  const prefilledQuote = useRef<string | undefined>(undefined);
  const quoteEdits = useRef(new Set<string>());
  const quoteId = requestedQuoteId ?? sourceQuote?.id;
  const [quoteSnapshot, setQuoteSnapshot] = useState<QuoteSnapshot | null>(null);
  const [quoteChargePrefillError, setQuoteChargePrefillError] = useState<string | null>(null);

  const recordQuoteEdit = useEffectEvent((name?: string) => {
    if (!name || (prefilledQuote.current && prefilledQuote.current === quoteId)) return;
    quoteEdits.current.add(name);
  });
  useEffect(() => {
    quoteEdits.current = new Set();
    if (isEdit || hasOtherPrefill || requestedQuoteId === null) return;
    // The quote can arrive after the first manual row. Its arrival does not
    // start a new session when the caller has not supplied an explicit ID.
    const subscription = form.watch((_values, { name }) => { recordQuoteEdit(name); });
    return () => subscription.unsubscribe();
  }, [form, hasOtherPrefill, isEdit, requestedQuoteId]);

  const prefillQuote = useEffectEvent(() => {
    if (isEdit || !matchesRequestedQuote(sourceQuote, quoteId, chargeAvailability)) return;
    if (sourceQuote.id && prefilledQuote.current === sourceQuote.id) return;
    if (hasOtherPrefill) {
      prefilledQuote.current = sourceQuote.id;
      setQuoteSnapshot(captureQuoteSnapshot(sourceQuote));
      return;
    }
    if (!customers || !forklifts || (sourceQuote.quote_type === "sale" && !assignments)) return;
    const edits = quoteEdits.current;
    if ([...edits].some(changesQuoteReceiverOrPeriod)) {
      setQuoteChargePrefillError("Cambiaste el receptor, los datos fiscales o el periodo mientras cargaba la cotización. Vuelve a abrir Facturar desde la cotización para cargar los datos de origen.");
      return;
    }
    try {
      assertQuoteEquipment(sourceQuote, assignments, forklifts);
      const values = buildFromQuote({ q: sourceQuote, assignments, forklifts, customers, chargeAvailability });
      prefilledQuote.current = sourceQuote.id;
      quoteEdits.current = new Set();
      applyQuoteDraft(form, values, edits);
      // Capture the optimistic version with the exact values entering the form.
      // Later refetches must not authorize this older draft with a newer version.
      setQuoteSnapshot(captureQuoteSnapshot(sourceQuote));
      setQuoteChargePrefillError(null);
    } catch (error) {
      setQuoteChargePrefillError(error instanceof Error ? error.message : "No se pudieron verificar los cargos de la cotización.");
    }
  });
  // Commit the version together with the one-time synchronization of the RHF draft.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { prefillQuote(); }, [sourceQuote, quoteId, customers, isEdit, assignments, forklifts, chargeAvailability, hasOtherPrefill]);
  const sourceQuoteVersion = snapshotVersion(quoteSnapshot, sourceQuote, isEdit);
  return { quoteChargePrefillError, sourceQuoteVersion };
}
