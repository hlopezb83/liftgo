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
}

export function useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form }: Props) {
  usePrefillEffect(() => {
    if (!existing) return;
    form.reset(buildFromInvoice(existing, customers));
  }, [existing, customers]);

  usePrefillEffect(() => {
    if (!sourceQuote || isEdit) return;
    form.reset(buildFromQuote({ q: sourceQuote, assignments, forklifts, customers }), { keepDirty: true });
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);
}
