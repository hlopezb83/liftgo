import { useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useBookings, type BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useInvoice, useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useQuote } from "@/features/quotes/hooks/quotes/useQuotes";
import { useQuoteAssignments } from "@/features/fleet/hooks/forklifts/useAssignForklifts";
import { generateLineItems, computeTotals } from "@/features/invoices/lib/invoiceHelpers";
import {
  invoiceFormSchema,
  buildEmptyInvoiceValues,
  type InvoiceFormValues,
  type LineItemValues,
} from "@/lib/schemas/invoiceFormSchema";
import { useInvoicePrefill, cfdiFromCustomer } from "./invoiceForm/useInvoicePrefill";
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

  const invoicedBookingIds = useMemo(() => new Set(
    invoices?.filter((invoice) => invoice.status !== "cancelled" && invoice.booking_id)
      .map((invoice) => invoice.booking_id),
  ), [invoices]);

  const handleCustomerSelect = useCallback((selectedCustomerId: string) => {
    form.setValue("customerId", selectedCustomerId, { shouldDirty: true });
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    form.setValue("customerName", customer.name, { shouldDirty: true });
    const patch = cfdiFromCustomer(customer);
    (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
      const v = patch[k];
      if (v !== undefined) form.setValue(`cfdi.${k}`, v, { shouldDirty: true });
    });
  }, [form, customers]);

  const handleBookingSelect = useCallback((selectedBookingId: string) => {
    form.setValue("bookingId", selectedBookingId, { shouldDirty: true });
    const booking = bookings?.find((b) => b.id === selectedBookingId);
    if (!booking) return;
    form.setValue("customerName", booking.customer_name || "", { shouldDirty: true });
    form.setValue("customerId", booking.customer_id || null, { shouldDirty: true });
    if (booking.customer_id && customers) {
      const customer = customers.find((c) => c.id === booking.customer_id);
      if (customer) {
        const patch = cfdiFromCustomer(customer);
        (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
          const v = patch[k];
          if (v !== undefined) form.setValue(`cfdi.${k}`, v, { shouldDirty: true });
        });
      }
    }
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (forklift) {
      const items = generateLineItems(forklift, booking.start_date, booking.end_date);
      form.setValue("lineItems", items.map((item) => ({
        ...item, clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
      })), { shouldDirty: true });
    }
  }, [form, bookings, customers, forklifts]);

  const watched = useWatch({ control: form.control, name: ["lineItems", "taxRate"] });
  const totals = useMemo(() => {
    const items = (watched[0] ?? []).map((i) => ({
      description: i?.description ?? "",
      quantity: Number(i?.quantity ?? 0),
      unit_price: Number(i?.unit_price ?? 0),
      total: Number(i?.total ?? 0),
      discount: i?.discount,
      discount_type: i?.discount_type,
    }));
    return computeTotals(items, Number(watched[1] ?? 0));
  }, [watched]);

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
