import { useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues } from "@/features/invoices/lib/invoiceFormSchema";
import { generateLineItems } from "@/lib/domain/invoiceHelpers";
import type { Forklift } from "@/features/fleet";
import { cfdiFromCustomer, type Customer } from "./invoiceFormBuilders";

type Booking = {
  id: string; customer_name?: string | null; customer_id?: string | null;
  forklift_id: string; start_date: string; end_date: string;
};

interface Props {
  form: UseFormReturn<InvoiceFormValues>;
  customers: Customer[] | undefined;
  bookings: Booking[] | undefined;
  forklifts: Forklift[] | undefined;
}

function applyCfdiPatch(form: UseFormReturn<InvoiceFormValues>, customer: Customer) {
  const patch = cfdiFromCustomer(customer);
  (Object.keys(patch) as (keyof typeof patch)[]).forEach((k) => {
    const v = patch[k];
    if (v !== undefined) form.setValue(`cfdi.${k}`, v, { shouldDirty: true });
  });
}

export function useInvoiceFormHandlers({ form, customers, bookings, forklifts }: Props) {
  const handleCustomerSelect = useCallback((selectedCustomerId: string) => {
    form.setValue("customerId", selectedCustomerId, { shouldDirty: true });
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    form.setValue("customerName", customer.name, { shouldDirty: true });
    applyCfdiPatch(form, customer);
  }, [form, customers]);

  const handleBookingSelect = useCallback((selectedBookingId: string) => {
    form.setValue("bookingId", selectedBookingId, { shouldDirty: true });
    const booking = bookings?.find((b) => b.id === selectedBookingId);
    if (!booking) return;
    form.setValue("customerName", booking.customer_name || "", { shouldDirty: true });
    form.setValue("customerId", booking.customer_id || null, { shouldDirty: true });
    if (booking.customer_id && customers) {
      const customer = customers.find((c) => c.id === booking.customer_id);
      if (customer) applyCfdiPatch(form, customer);
    }
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (!forklift) return;
    const items = generateLineItems(forklift, booking.start_date, booking.end_date);
    form.setValue("lineItems", items.map((item) => ({
      ...item, clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
    })), { shouldDirty: true });
  }, [form, bookings, customers, forklifts]);

  return { handleCustomerSelect, handleBookingSelect };
}
