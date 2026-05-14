import { useParams, useSearchParams } from "react-router-dom";
import { useBookings, type BookingWithForklift } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { useInvoice, useInvoices } from "@/hooks/useInvoices";
import { useCustomers } from "@/hooks/useCustomers";
import { useQuote } from "@/hooks/useQuotes";
import { useQuoteAssignments } from "@/hooks/useAssignForklifts";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { useInvoiceFormState, type CfdiFormState } from "./invoiceForm/useInvoiceFormState";
import { useInvoicePrefill, applyCustomerCfdi } from "./invoiceForm/useInvoicePrefill";
import { useInvoiceFormSubmit } from "./invoiceForm/useInvoiceFormSubmit";

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

  const updateLineItem = (index: number, field: string, value: string | number) => {
    setLineItems((previous) => previous.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        updated.total = Math.round(Number(updated.quantity) * Number(updated.unit_price) * 100) / 100;
      }
      return updated;
    }));
  };

  const addLineItem = () => setLineItems((previous) => [...previous, {
    description: "", quantity: 1, unit_price: 0, total: 0,
    clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
  }]);

  const removeLineItem = (index: number) => setLineItems((previous) => previous.filter((_, i) => i !== index));

  const handleCfdiUpdate = (field: string, value: string | number) => {
    setCfdi(field as keyof CfdiFormState, value as CfdiFormState[keyof CfdiFormState]);
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
    updateLineItem, addLineItem, removeLineItem, handleCfdiUpdate,
    buildPayload,
    createInvoice: submit.createInvoice,
    updateInvoice: submit.updateInvoice,
    updateQuote: submit.updateQuote,
    subtotal, taxAmount, total,
    isPending: submit.isPending,
  };
}
