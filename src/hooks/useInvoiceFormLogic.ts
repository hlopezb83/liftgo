import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useBookings, type BookingWithForklift } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { useCreateInvoice, useUpdateInvoice, useInvoice, useInvoices } from "@/hooks/useInvoices";
import { useCustomers } from "@/hooks/useCustomers";
import { useQuote, useUpdateQuote } from "@/hooks/useQuotes";
import { useQuoteAssignments } from "@/hooks/useAssignForklifts";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { parseDateLocal } from "@/lib/utils";
import { useFormState } from "@/hooks/useFormState";
import type { CfdiLineItem } from "@/components/invoice-form/EditableLineItemsTable";
import { toast } from "sonner";
import { format } from "date-fns";

const INITIAL_CFDI = {
  serie: "",
  folio: "",
  formaPago: "03",
  metodoPago: "PUE",
  usoCfdi: "G03",
  moneda: "MXN",
  tipoCambio: 1 as number,
  receptorRfc: "",
  receptorRazonSocial: "",
  receptorRegimenFiscal: "",
  receptorDomicilioFiscalCp: "",
};

export type CfdiFormState = typeof INITIAL_CFDI;

export function useInvoiceFormLogic() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");
  const isEdit = !!id;

  // Data sources
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existing } = useInvoice(id);
  const { data: sourceQuote } = useQuote(fromQuoteId || undefined);
  const { data: assignments } = useQuoteAssignments(fromQuoteId || undefined);
  const { data: invoices } = useInvoices();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const updateQuote = useUpdateQuote();

  // Already-invoiced bookings (to filter the selector)
  const invoicedBookingIds = new Set(
    invoices?.filter(invoice => invoice.status !== "cancelled" && invoice.booking_id)
      .map(invoice => invoice.booking_id),
  );

  // Form state
  const [bookingId, setBookingId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<CfdiLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(16);
  const [dueDate, setDueDate] = useState<Date>();
  const [issueDate, setIssueDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");
  const { form: cfdi, set: setCfdi, setForm: setCfdiForm } = useFormState(INITIAL_CFDI);

  // ─── Helpers ────────────────────────────────────────────
  const applyCustomerCfdi = (customer: NonNullable<typeof customers>[number]) => {
    setCfdi("receptorRfc", customer.rfc || "");
    setCfdi("receptorRazonSocial", customer.name || "");
    setCfdi("receptorRegimenFiscal", customer.regimen_fiscal || "");
    setCfdi("receptorDomicilioFiscalCp", customer.domicilio_fiscal_cp || "");
    if (customer.uso_cfdi) setCfdi("usoCfdi", customer.uso_cfdi);
  };

  // ─── Pre-fill from existing invoice (edit mode) ─────────
  useEffect(() => {
    if (!existing) return;
    setCustomerName(existing.customer_name || "");
    setCustomerId(existing.customer_id);
    setBookingId(existing.booking_id || "");
    setLineItems((existing.line_items as unknown as CfdiLineItem[]) || []);
    setTaxRate(Number(existing.tax_rate) || 0);
    setDueDate(existing.due_date ? parseDateLocal(existing.due_date) : undefined);
    setIssueDate(existing.issued_at ? parseDateLocal(existing.issued_at) : new Date());
    setNotes(existing.notes || "");
    setCfdiForm({
      serie: existing.serie || "",
      folio: existing.folio || "",
      formaPago: existing.forma_pago || "03",
      metodoPago: existing.metodo_pago || "PUE",
      usoCfdi: existing.uso_cfdi || "G03",
      moneda: existing.moneda || "MXN",
      tipoCambio: Number(existing.tipo_cambio) || 1,
      receptorRfc: existing.receptor_rfc || "",
      receptorRazonSocial: existing.receptor_razon_social || "",
      receptorRegimenFiscal: existing.receptor_regimen_fiscal || "",
      receptorDomicilioFiscalCp: existing.receptor_domicilio_fiscal_cp || "",
    });
    if (existing.customer_id && !existing.receptor_rfc && customers) {
      const customer = customers.find((c) => c.id === existing.customer_id);
      if (customer) applyCustomerCfdi(customer);
    }
  }, [existing, customers]);

  // ─── Pre-fill from source quote ─────────────────────────
  useEffect(() => {
    if (!sourceQuote || isEdit) return;
    setCustomerName(sourceQuote.customer_name || "");
    setCustomerId(sourceQuote.customer_id);
    const quoteItems = (sourceQuote.line_items as unknown as CfdiLineItem[]) || [];
    const isSaleWithAssignments = sourceQuote.quote_type === "sale" && assignments && assignments.length > 0;
    setLineItems(quoteItems.map((item, index) => {
      const enriched: CfdiLineItem = {
        ...item,
        clave_prod_serv: item.clave_prod_serv || "78181500",
        clave_unidad: item.clave_unidad || "DAY",
        objeto_imp: item.objeto_imp || "02",
      };
      if (isSaleWithAssignments) {
        const assignment = assignments.find((a) => a.line_index === index);
        if (assignment) {
          const forklift = forklifts?.find((f) => f.id === assignment.forklift_id);
          if (forklift) {
            enriched.description = `${forklift.manufacturer || ""} ${forklift.model} — S/N: ${forklift.serial_number || "N/A"} (${forklift.name}) - Venta de equipo`;
          }
        }
      }
      return enriched;
    }));
    setTaxRate(Number(sourceQuote.tax_rate) || 16);
    setNotes(sourceQuote.notes || "");
    if (sourceQuote.customer_id && customers) {
      const customer = customers.find((c) => c.id === sourceQuote.customer_id);
      if (customer) applyCustomerCfdi(customer);
    }
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);

  // ─── Event handlers ─────────────────────────────────────
  const handleCustomerSelect = (selectedCustomerId: string) => {
    setCustomerId(selectedCustomerId);
    const customer = customers?.find((c) => c.id === selectedCustomerId);
    if (!customer) return;
    setCustomerName(customer.name);
    applyCustomerCfdi(customer);
  };

  const handleBookingSelect = (selectedBookingId: string) => {
    setBookingId(selectedBookingId);
    const booking = bookings?.find((b) => b.id === selectedBookingId);
    if (!booking) return;
    setCustomerName(booking.customer_name || "");
    setCustomerId(booking.customer_id || null);
    if (booking.customer_id && customers) {
      const customer = customers.find((c) => c.id === booking.customer_id);
      if (customer) applyCustomerCfdi(customer);
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

  // ─── Computed values ────────────────────────────────────
  const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);
  const isPending = createInvoice.isPending || updateInvoice.isPending;

  // ─── Available bookings for selector ────────────────────
  const availableBookings = bookings?.filter(
    (booking) => booking.status === "confirmed" && !invoicedBookingIds.has(booking.id),
  ) as BookingWithForklift[] | undefined;

  // ─── Submit ─────────────────────────────────────────────
  const buildPayload = () => ({
    booking_id: bookingId || (isEdit ? existing?.booking_id : null) || null,
    customer_id: customerId,
    customer_name: customerName || null,
    quote_id: fromQuoteId || (isEdit ? existing?.quote_id : null) || null,
    line_items: lineItems as unknown as import("@/integrations/supabase/types").Json,
    subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
    due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
    issued_at: format(issueDate, "yyyy-MM-dd"),
    notes: notes || null,
    serie: cfdi.serie || null, folio: cfdi.folio || null, forma_pago: cfdi.formaPago || null,
    metodo_pago: cfdi.metodoPago || null, uso_cfdi: cfdi.usoCfdi || null, moneda: cfdi.moneda || null,
    tipo_cambio: cfdi.tipoCambio, receptor_rfc: cfdi.receptorRfc || null,
    receptor_razon_social: cfdi.receptorRazonSocial || null, receptor_regimen_fiscal: cfdi.receptorRegimenFiscal || null,
    receptor_domicilio_fiscal_cp: cfdi.receptorDomicilioFiscalCp || null,
  });

  return {
    // Routing state
    isEdit,
    id,
    fromQuoteId,
    // Form fields
    bookingId,
    customerName,
    customerId,
    lineItems,
    taxRate,
    setTaxRate,
    dueDate,
    setDueDate,
    issueDate,
    setIssueDate,
    notes,
    setNotes,
    cfdi,
    // Data
    customers,
    availableBookings,
    // Handlers
    handleCustomerSelect,
    handleBookingSelect,
    updateLineItem,
    addLineItem,
    removeLineItem,
    handleCfdiUpdate,
    buildPayload,
    // Mutations
    createInvoice,
    updateInvoice,
    updateQuote,
    // Computed
    subtotal,
    taxAmount,
    total,
    isPending,
  };
}
