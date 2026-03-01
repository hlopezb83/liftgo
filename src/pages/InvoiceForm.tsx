import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBookings, type BookingWithForklift } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { useCreateInvoice, useUpdateInvoice, useInvoice } from "@/hooks/useInvoices";
import { useCustomers } from "@/hooks/useCustomers";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export default function InvoiceForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existing } = useInvoice(id);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const [bookingId, setBookingId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<CfdiLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(16);
  const [dueDate, setDueDate] = useState<Date>();
  const [issueDate, setIssueDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");

  // CFDI fields
  const [serie, setSerie] = useState("");
  const [folio, setFolio] = useState("");
  const [formaPago, setFormaPago] = useState("03");
  const [metodoPago, setMetodoPago] = useState("PUE");
  const [usoCfdi, setUsoCfdi] = useState("G03");
  const [moneda, setMoneda] = useState("MXN");
  const [tipoCambio, setTipoCambio] = useState(1);
  const [receptorRfc, setReceptorRfc] = useState("");
  const [receptorRazonSocial, setReceptorRazonSocial] = useState("");
  const [receptorRegimenFiscal, setReceptorRegimenFiscal] = useState("");
  const [receptorDomicilioFiscalCp, setReceptorDomicilioFiscalCp] = useState("");

  useEffect(() => {
    if (existing) {
      setCustomerName(existing.customer_name || "");
      setCustomerId(existing.customer_id);
      setBookingId(existing.booking_id || "");
      setLineItems((existing.line_items as unknown as CfdiLineItem[]) || []);
      setTaxRate(Number(existing.tax_rate) || 0);
      setDueDate(existing.due_date ? new Date(existing.due_date) : undefined);
      setIssueDate(existing.issued_at ? new Date(existing.issued_at) : new Date());
      setNotes(existing.notes || "");
      setSerie(existing.serie || "");
      setFolio(existing.folio || "");
      setFormaPago(existing.forma_pago || "03");
      setMetodoPago(existing.metodo_pago || "PUE");
      setUsoCfdi(existing.uso_cfdi || "G03");
      setMoneda(existing.moneda || "MXN");
      setTipoCambio(Number(existing.tipo_cambio) || 1);
      setReceptorRfc(existing.receptor_rfc || "");
      setReceptorRazonSocial(existing.receptor_razon_social || "");
      setReceptorRegimenFiscal(existing.receptor_regimen_fiscal || "");
      setReceptorDomicilioFiscalCp(existing.receptor_domicilio_fiscal_cp || "");
    }
  }, [existing]);

  const applyCustomerCfdi = (cust: NonNullable<typeof customers>[number]) => {
    setReceptorRfc(cust.rfc || "");
    setReceptorRazonSocial(cust.name || "");
    setReceptorRegimenFiscal(cust.regimen_fiscal || "");
    setReceptorDomicilioFiscalCp(cust.domicilio_fiscal_cp || "");
    if (cust.uso_cfdi) setUsoCfdi(cust.uso_cfdi);
  };

  const handleCustomerSelect = (cId: string) => {
    setCustomerId(cId);
    const cust = customers?.find((c) => c.id === cId);
    if (!cust) return;
    setCustomerName(cust.name);
    applyCustomerCfdi(cust);
  };

  const handleBookingSelect = (bId: string) => {
    setBookingId(bId);
    const booking = bookings?.find((b) => b.id === bId);
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
    const setters: Record<string, (v: any) => void> = {
      serie: setSerie, folio: setFolio, formaPago: setFormaPago, metodoPago: setMetodoPago,
      usoCfdi: setUsoCfdi, moneda: setMoneda, tipoCambio: setTipoCambio,
      receptorRfc: setReceptorRfc, receptorRazonSocial: setReceptorRazonSocial,
      receptorRegimenFiscal: setReceptorRegimenFiscal, receptorDomicilioFiscalCp: setReceptorDomicilioFiscalCp,
    };
    setters[field]?.(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lineItems.length === 0) { toast.error("Agrega al menos una partida"); return; }

    const payload = {
      booking_id: bookingId || null, customer_id: customerId, customer_name: customerName || null,
      line_items: lineItems as unknown as import("@/integrations/supabase/types").Json,
      subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      issued_at: format(issueDate, "yyyy-MM-dd"),
      notes: notes || null,
      serie: serie || null, folio: folio || null, forma_pago: formaPago || null,
      metodo_pago: metodoPago || null, uso_cfdi: usoCfdi || null, moneda: moneda || null,
      tipo_cambio: tipoCambio, receptor_rfc: receptorRfc || null,
      receptor_razon_social: receptorRazonSocial || null, receptor_regimen_fiscal: receptorRegimenFiscal || null,
      receptor_domicilio_fiscal_cp: receptorDomicilioFiscalCp || null,
    };

    if (isEdit) {
      updateInvoice.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Factura actualizada"); navigate(`/invoices/${id}`); },
      });
    } else {
      createInvoice.mutate(payload, {
        onSuccess: (data) => { toast.success(`Factura ${data.invoice_number} creada`); navigate(`/invoices/${data.id}`); },
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
                    {bookings?.filter((b) => b.status === "confirmed").map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {(b as BookingWithForklift).forklifts?.name} — {b.customer_name || "Sin cliente"} ({b.start_date} → {b.end_date})
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
          serie={serie} folio={folio} formaPago={formaPago} metodoPago={metodoPago}
          usoCfdi={usoCfdi} moneda={moneda} tipoCambio={tipoCambio}
          receptorRfc={receptorRfc} receptorRazonSocial={receptorRazonSocial}
          receptorRegimenFiscal={receptorRegimenFiscal} receptorDomicilioFiscalCp={receptorDomicilioFiscalCp}
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
