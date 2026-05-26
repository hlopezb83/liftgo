import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues } from "@/features/invoices/lib/invoiceFormSchema";
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
  useEffect(() => {
    if (!existing) return;
    form.reset(buildFromInvoice(existing, customers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, customers]);

  useEffect(() => {
    if (!sourceQuote || isEdit) return;
    form.reset(buildFromQuote({ q: sourceQuote, assignments, forklifts, customers }), { keepDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);
}
