import { useParams, useSearchParams } from "react-router-dom";
import { useBookings, type BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import { useInvoice, useInvoices } from "@/features/invoices/hooks/invoices/useInvoices";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useQuote } from "@/features/quotes/hooks/quotes/useQuotes";
import { useQuoteAssignments } from "@/features/fleet/hooks/forklifts/useAssignForklifts";
import { generateLineItems, computeTotals } from "@/features/invoices/lib/invoiceHelpers";
import { useInvoiceFormState, type CfdiFormState } from "./invoiceForm/useInvoiceFormState";
import { useInvoicePrefill, applyCustomerCfdi } from "./invoiceForm/useInvoicePrefill";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";
import { useInvoiceLineItemHandlers } from "./invoiceForm/useInvoiceLineItemHandlers";

export type { CfdiFormState };

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

  const state = useInvoiceFormState();
  useInvoicePrefill({ existing, sourceQuote, assignments, forklifts, customers, isEdit, state });
  const submit = useInvoiceFormSubmit();
  const lineHandlers = useInvoiceLineItemHandlers(state);

  const {
    bookingId, customerName, customerId, lineItems, taxRate, dueDate, issueDate, notes, cfdi,
    setBookingId, setCustomerName, setCustomerId, setLineItems, setCfdi,
  } = state;

  const invoicedBookingIds = new Set(
    invoices?.filter((invoice) => invoice.status !== "cancelled" && invoice.booking_id)
      .map((invoice) => invoice.booking_id),
  );

  const handleCustomerSelect = (selectedCustomerId: string) => {
    setCustomerId(selectedCustomerId);
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    setCustomerName(customer.name);
    applyCustomerCfdi(customer, setCfdi);
  };

  const handleBookingSelect = (selectedBookingId: string) => {
    setBookingId(selectedBookingId);
    const booking = bookings?.find((b) => b.id === selectedBookingId);
    if (!booking) return;
    setCustomerName(booking.customer_name || "");
    setCustomerId(booking.customer_id || null);
    if (booking.customer_id && customers) {
      const customer = customers.find((c) => c.id === booking.customer_id);
      if (customer) applyCustomerCfdi(customer, setCfdi);
    }
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (forklift) {
      const items = generateLineItems(forklift, booking.start_date, booking.end_date);
      setLineItems(items.map((item) => ({
        ...item, clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
      })));
    }
  };

  const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);

  const availableBookings = bookings?.filter(
    (booking) => booking.status === "confirmed" && !invoicedBookingIds.has(booking.id),
  ) as BookingWithForklift[] | undefined;

  const buildPayload = () => submit.buildPayload({
    state, isEdit, fromQuoteId,
    existingBookingId: existing?.booking_id,
    existingQuoteId: existing?.quote_id,
  });

  return {
    isEdit, id, fromQuoteId,
    bookingId, customerName, customerId, lineItems,
    taxRate, setTaxRate: state.setTaxRate,
    dueDate, setDueDate: state.setDueDate,
    issueDate, setIssueDate: state.setIssueDate,
    notes, setNotes: state.setNotes,
    cfdi,
    customers, availableBookings,
    handleCustomerSelect, handleBookingSelect,
    ...lineHandlers,
    buildPayload,
    createInvoice: submit.createInvoice,
    updateInvoice: submit.updateInvoice,
    updateQuote: submit.updateQuote,
    subtotal, taxAmount, total,
    isPending: submit.isPending,
  };
}
