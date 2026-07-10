import { useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues, LineItemValues } from "../../lib/invoiceFormSchema";
import { generateLineItems } from "@/lib/domain/invoiceHelpers";
import type { Forklift } from "@/features/fleet";
import { extractNonRentalLines } from "@/features/quotes/utils/nonRentalLines";
import { cfdiFromCustomer, type Customer } from "./invoiceFormBuilders";

type Booking = {
  id: string; customer_name?: string | null; customer_id?: string | null;
  forklift_id: string; start_date: string; end_date: string;
  quote_id?: string | null;
};

type QuoteSource = { id: string; line_items: unknown };

interface Props {
  form: UseFormReturn<InvoiceFormValues>;
  customers: Customer[] | undefined;
  bookings: Booking[] | undefined;
  forklifts: Forklift[] | undefined;
  /** Cotizaciones origen de las reservas cargadas; se usan para arrastrar
   *  partidas no-renta (logística/entrega) a la factura. */
  quotes?: QuoteSource[] | undefined;
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

export function useInvoiceFormHandlers({ form, customers, bookings, forklifts, quotes }: Props) {
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

    applyPrimaryCustomer(form, selected[0], customers);

    const rentalLines = selected.flatMap((b) => buildLinesForBooking(b, forklifts));
    const extraLines = collectExtraLinesFromQuotes(selected, quotes);

    form.setValue("lineItems", [...rentalLines, ...extraLines], { shouldDirty: true });
  }, [form, bookings, customers, forklifts, quotes]);

  // Compat: handler antiguo single-select (delega al multi).
  const handleBookingSelect = useCallback((id: string) => {
    handleBookingsChange(id ? [id] : []);
  }, [handleBookingsChange]);

  return { handleCustomerSelect, handleBookingSelect, handleBookingsChange };
}
