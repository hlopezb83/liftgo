import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useBookings, type BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useInvoice, useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useQuote } from "@/features/quotes/hooks/quotes/useQuotes";
import { useQuoteAssignments } from "@/features/fleet/hooks/forklifts/useAssignForklifts";
import { useQuoteSaleAssignmentStatus } from "@/features/quotes/hooks/quoteDetail/useQuoteSaleAssignmentStatus";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import {
  invoiceFormSchema,
  buildEmptyInvoiceValues,
  type InvoiceFormValues,
  type LineItemValues,
} from "@/features/invoices/lib/invoiceFormSchema";
import { useInvoicePrefill } from "./invoiceForm/useInvoicePrefill";
import { useInvoiceFormHandlers } from "./invoiceForm/useInvoiceFormHandlers";
import { useInvoiceFormTotals } from "./invoiceForm/useInvoiceFormTotals";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";

export type { InvoiceFormValues, LineItemValues };

export function useInvoiceFormLogic() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");
  const isEdit = !!id;

  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existing } = useInvoice(id);
  const { data: sourceQuote } = useQuote(fromQuoteId || undefined);
  const { data: assignments } = useQuoteAssignments(fromQuoteId || undefined);
  const { data: invoices } = useInvoices();

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: buildEmptyInvoiceValues(),
  });

  useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, form });
  const submit = useInvoiceFormSubmit();
  const { handleCustomerSelect, handleBookingSelect } = useInvoiceFormHandlers({ form, customers, bookings, forklifts });
  const totals = useInvoiceFormTotals(form);

  const invoicedBookingIds = useMemo(() => new Set(
    invoices?.filter((invoice) => invoice.status !== "cancelled" && invoice.booking_id)
      .map((invoice) => invoice.booking_id),
  ), [invoices]);

  const availableBookings = bookings?.filter(
    (booking) => booking.status === "confirmed" && !invoicedBookingIds.has(booking.id),
  ) as BookingWithForklift[] | undefined;

  const onSubmit = (values: InvoiceFormValues) => submit.buildPayload({
    values, isEdit, fromQuoteId,
    existingBookingId: existing?.booking_id,
    existingQuoteId: existing?.quote_id,
  });

  return {
    form, isEdit, id, fromQuoteId,
    customers, availableBookings,
    handleCustomerSelect, handleBookingSelect,
    onSubmit,
    createInvoice: submit.createInvoice,
    updateInvoice: submit.updateInvoice,
    updateQuote: submit.updateQuote,
    subtotal: totals.subtotal, taxAmount: totals.taxAmount, total: totals.total,
    isPending: submit.isPending,
  };
}
