import { useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues, LineItemValues } from "../../lib/invoiceFormSchema";
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

function buildLinesForBooking(booking: Booking, forklifts: Forklift[] | undefined): LineItemValues[] {
  const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
  if (!forklift) return [];
  const items = generateLineItems(forklift, booking.start_date, booking.end_date);
  return items.map((item) => ({
    ...item,
    clave_prod_serv: "78181500",
    clave_unidad: "DAY",
    objeto_imp: "02",
  }));
}

export function useInvoiceFormHandlers({ form, customers, bookings, forklifts }: Props) {
  const handleCustomerSelect = useCallback((selectedCustomerId: string) => {
    form.setValue("customerId", selectedCustomerId, { shouldDirty: true });
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    form.setValue("customerName", customer.name, { shouldDirty: true });
    applyCfdiPatch(form, customer);
  }, [form, customers]);

  const handleBookingsChange = useCallback((selectedIds: string[]) => {
    const selected = selectedIds
      .map((id) => bookings?.find((b) => b.id === id))
      .filter((b): b is Booking => !!b);

    form.setValue("bookingIds", selectedIds, { shouldDirty: true });
    form.setValue("bookingId", selectedIds[0] ?? "", { shouldDirty: true });

    if (selected.length === 0) return;

    const first = selected[0];
    form.setValue("customerName", first.customer_name || "", { shouldDirty: true });
    form.setValue("customerId", first.customer_id || null, { shouldDirty: true });
    if (first.customer_id && customers) {
      const customer = customers.find((c) => c.id === first.customer_id);
      if (customer) applyCfdiPatch(form, customer);
    }

    const allLines = selected.flatMap((b) => buildLinesForBooking(b, forklifts));
    form.setValue("lineItems", allLines, { shouldDirty: true });
  }, [form, bookings, customers, forklifts]);

  // Compat: handler antiguo single-select (delega al multi).
  const handleBookingSelect = useCallback((id: string) => {
    handleBookingsChange(id ? [id] : []);
  }, [handleBookingsChange]);

  return { handleCustomerSelect, handleBookingSelect, handleBookingsChange };
}
