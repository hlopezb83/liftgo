import { useState, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useBookings, type BookingWithForklift } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { useCreateInvoice, useUpdateInvoice, useInvoice, useInvoices } from "@/hooks/useInvoices";
import { useCustomers } from "@/hooks/useCustomers";
import { useQuote, useUpdateQuote } from "@/hooks/useQuotes";
import { useQuoteAssignments } from "@/hooks/useAssignForklifts";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { parseDateLocal } from "@/lib/utils";
import { useFormState } from "@/hooks/useFormState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { TotalsSummary } from "@/components/TotalsSummary";
import { CfdiFieldsCard } from "@/components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable, type CfdiLineItem } from "@/components/invoice-form/EditableLineItemsTable";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateDisplay } from "@/lib/utils";

const initialCfdi = {
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

export default function InvoiceForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");
  const isEdit = !!id;
  const navigate = useNavigate();
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

  const invoicedBookingIds = new Set(
    invoices?.filter(inv => inv.status !== 'cancelled' && inv.booking_id)
      .map(inv => inv.booking_id)
  );

  const [bookingId, setBookingId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<CfdiLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(16);
  const [dueDate, setDueDate] = useState<Date>();
  const [issueDate, setIssueDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");

  const { form: cfdi, set: setCfdi, setForm: setCfdiForm } = useFormState(initialCfdi);

  useEffect(() => {
    if (existing) {
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
    }
  }, [existing]);

  // Pre-fill from source quote
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
      const cust = customers.find((c) => c.id === sourceQuote.customer_id);
      if (cust) applyCustomerCfdi(cust);
    }
  }, [sourceQuote, customers, isEdit, assignments, forklifts]);

  const applyCustomerCfdi = (cust: NonNullable<typeof customers>[number]) => {
    setCfdi("receptorRfc", cust.rfc || "");
    setCfdi("receptorRazonSocial", cust.name || "");
    setCfdi("receptorRegimenFiscal", cust.regimen_fiscal || "");
    setCfdi("receptorDomicilioFiscalCp", cust.domicilio_fiscal_cp || "");
    if (cust.uso_cfdi) setCfdi("usoCfdi", cust.uso_cfdi);
  };

  const handleCustomerSelect = (selectedCustomerId: string) => {
    setCustomerId(selectedCustomerId);
    const cust = customers?.find((c) => c.id === selectedCustomerId);
    if (!cust) return;
    setCustomerName(cust.name);
    applyCustomerCfdi(cust);
  };

  const handleBookingSelect = (selectedBookingId: string) => {
    setBookingId(selectedBookingId);
    const booking = bookings?.find((b) => b.id === selectedBookingId);
    if (!booking) return;
    setCustomerName(booking.customer_name || "");
    setCustomerId(booking.customer_id || null);
    if (booking.customer_id && customers) {
      const cust = customers.find((c) => c.id === booking.customer_id);
      if (cust) applyCustomerCfdi(cust);
    }
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (forklift) {
      const items = generateLineItems(forklift, booking.start_date, booking.end_date);
      setLineItems(items.map((item) => ({
        ...item, clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
      })));
    }
  };

  const updateItem = (idx: number, field: string, value: string | number) => {
    setLineItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        updated.total = Math.round(Number(updated.quantity) * Number(updated.unit_price) * 100) / 100;
      }
      return updated;
    }));
  };

  const addItem = () => setLineItems((prev) => [...prev, {
    description: "", quantity: 1, unit_price: 0, total: 0,
    clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
  }]);
  const removeItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));

  const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);

  const handleCfdiUpdate = (field: string, value: string | number) => {
    setCfdi(field as keyof typeof initialCfdi, value as any);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lineItems.length === 0) { toast.error("Agrega al menos una partida"); return; }

    const payload = {
      booking_id: bookingId || null, customer_id: customerId, customer_name: customerName || null,
      quote_id: fromQuoteId || null,
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
    };

    if (isEdit) {
      updateInvoice.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Factura actualizada"); navigate(`/invoices/${id}`); },
      });
    } else {
      createInvoice.mutate(payload, {
        onSuccess: (data) => {
          toast.success(`Factura ${data.invoice_number} creada`);
          if (fromQuoteId) {
            updateQuote.mutate({ id: fromQuoteId, status: "accepted" });
          }
          navigate(`/invoices/${data.id}`);
        },
      });
    }
  };

  const isPending = createInvoice.isPending || updateInvoice.isPending;

  return (
    <div className="p-6 max-w-4xl">
      <FormPageHeader title={isEdit ? "Editar Factura" : "Nueva Factura"} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de Factura</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Generar desde Reserva</Label>
                <Select value={bookingId} onValueChange={handleBookingSelect}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar reserva (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {bookings?.filter((b) => b.status === "confirmed" && !invoicedBookingIds.has(b.id)).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {(b as BookingWithForklift).forklifts?.name} — {b.customer_name || "Sin cliente"} ({formatDateDisplay(b.start_date)} → {formatDateDisplay(b.end_date)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={customerId || ""} onValueChange={handleCustomerSelect}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` — ${c.company}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DatePickerField label="Fecha de Factura" date={issueDate} onSelect={(d) => setIssueDate(d || new Date())} placeholder="Seleccionar fecha" />
              <DatePickerField label="Fecha de Vencimiento" date={dueDate} onSelect={setDueDate} placeholder="Seleccionar fecha" />
            </div>
          </CardContent>
        </Card>

        <CfdiFieldsCard
          serie={cfdi.serie} folio={cfdi.folio} formaPago={cfdi.formaPago} metodoPago={cfdi.metodoPago}
          usoCfdi={cfdi.usoCfdi} moneda={cfdi.moneda} tipoCambio={cfdi.tipoCambio}
          receptorRfc={cfdi.receptorRfc} receptorRazonSocial={cfdi.receptorRazonSocial}
          receptorRegimenFiscal={cfdi.receptorRegimenFiscal} receptorDomicilioFiscalCp={cfdi.receptorDomicilioFiscalCp}
          onUpdate={handleCfdiUpdate}
        />

        <EditableLineItemsTable
          lineItems={lineItems}
          onUpdateItem={updateItem}
          onAddItem={addItem}
          onRemoveItem={removeItem}
        />

        <TotalsSummary subtotal={subtotal} taxRate={taxRate} taxAmount={taxAmount} total={total} onTaxRateChange={setTaxRate} />

        <NotesCard value={notes} onChange={setNotes} placeholder="Notas adicionales…" />

        <FormActions submitLabel={isEdit ? "Actualizar Factura" : "Crear Factura"} isPending={isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
