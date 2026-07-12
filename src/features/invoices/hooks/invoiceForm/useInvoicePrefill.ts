import { useEffect, useEffectEvent } from "react";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import {
  buildFromInvoice, buildFromQuote, cfdiFromCustomer,
  type Customer, type ExistingInvoice, type SourceQuote, type Forklift, type Assignment,
} from "./invoiceFormBuilders";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

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
  }, [existing?.booking_id, bookingIdsKey]);


  usePrefillEffect(() => {
    if (!sourceQuote || isEdit) return;
    form.reset(buildFromQuote({ q: sourceQuote, assignments, forklifts, customers }), { keepDirty: true });
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);
}
