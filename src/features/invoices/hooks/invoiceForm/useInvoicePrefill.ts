import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import {
  buildFromInvoice, buildFromQuote, cfdiFromCustomer,
  type Customer, type ExistingInvoice, type SourceQuote, type Forklift, type Assignment,
} from "./invoiceFormBuilders";

export { cfdiFromCustomer };

interface Props {
  existing: ExistingInvoice | null | undefined;
  sourceQuote: SourceQuote | null | undefined;
  assignments: Assignment[] | undefined;
  forklifts: Forklift[] | undefined;
  customers: Customer[] | undefined;
  isEdit: boolean;
  form: UseFormReturn<InvoiceFormValues>;
  existingBookingIds?: string[];
}

export function useInvoicePrefill({
  existing, sourceQuote, assignments, forklifts, customers, isEdit, form, existingBookingIds,
}: Props) {
  usePrefillEffect(() => {
    if (!existing) return;
    form.reset(buildFromInvoice(existing, customers));
  }, [existing, customers]);

  // Hydrate bookingIds from pivot table once it loads.
  useEffect(() => {
    if (!existing || !existingBookingIds) return;
    if (existingBookingIds.length === 0) return;
    form.setValue("bookingIds", existingBookingIds, { shouldDirty: false });
    if (!form.getValues("bookingId")) {
      form.setValue("bookingId", existingBookingIds[0] ?? "", { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.booking_id, existingBookingIds?.join(",")]);

  usePrefillEffect(() => {
    if (!sourceQuote || isEdit) return;
    form.reset(buildFromQuote({ q: sourceQuote, assignments, forklifts, customers }), { keepDirty: true });
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);
}
