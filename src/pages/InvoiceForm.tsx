import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBookings, useForklifts, useCreateInvoice, useUpdateInvoice, useInvoice, useCustomers } from "@/hooks/useForkliftData";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { FORMA_PAGO, METODO_PAGO, USO_CFDI, MONEDA, CLAVE_PROD_SERV, CLAVE_UNIDAD } from "@/lib/satCatalogs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";

interface CfdiLineItem extends LineItem {
  clave_prod_serv?: string;
  clave_unidad?: string;
  objeto_imp?: string;
}

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

  // Populate on edit
  useEffect(() => {
    if (existing) {
      setCustomerName(existing.customer_name || "");
      setCustomerId(existing.customer_id);
      setBookingId(existing.booking_id || "");
      setLineItems((existing.line_items as unknown as CfdiLineItem[]) || []);
      setTaxRate(Number(existing.tax_rate) || 0);
      setDueDate(existing.due_date ? new Date(existing.due_date) : undefined);
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

  const handleBookingSelect = (bId: string) => {
    setBookingId(bId);
    const booking = bookings?.find((b) => b.id === bId);
    if (!booking) return;
    setCustomerName(booking.customer_name || "");
    setCustomerId(booking.customer_id || null);
    if (booking.customer_id && customers) {
      const cust = customers.find((c) => c.id === booking.customer_id);
      if (cust) {
        setReceptorRfc(cust.rfc || "");
        setReceptorRazonSocial(cust.name || "");
        setReceptorRegimenFiscal(cust.regimen_fiscal || "");
        setReceptorDomicilioFiscalCp(cust.domicilio_fiscal_cp || "");
        if (cust.uso_cfdi) setUsoCfdi(cust.uso_cfdi);
      }
    }
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (forklift) {
      const items = generateLineItems(forklift, booking.start_date, booking.end_date);
      setLineItems(items.map((item) => ({
        ...item,
        clave_prod_serv: "78181500",
        clave_unidad: "DAY",
        objeto_imp: "02",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lineItems.length === 0) { toast.error("Agrega al menos una partida"); return; }

    const payload = {
      booking_id: bookingId || null,
      customer_id: customerId,
      customer_name: customerName || null,
      line_items: lineItems as unknown as import("@/integrations/supabase/types").Json,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      notes: notes || null,
      serie: serie || null,
      folio: folio || null,
      forma_pago: formaPago || null,
      metodo_pago: metodoPago || null,
      uso_cfdi: usoCfdi || null,
      moneda: moneda || null,
      tipo_cambio: tipoCambio,
      receptor_rfc: receptorRfc || null,
      receptor_razon_social: receptorRazonSocial || null,
      receptor_regimen_fiscal: receptorRegimenFiscal || null,
      receptor_domicilio_fiscal_cp: receptorDomicilioFiscalCp || null,
    };

    if (isEdit) {
      updateInvoice.mutate({ id, ...payload } as any, {
        onSuccess: () => { toast.success("Factura actualizada"); navigate(`/invoices/${id}`); },
      });
    } else {
      createInvoice.mutate(payload as any, {
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
                        {(b as any).forklifts?.name} — {b.customer_name || "Sin cliente"} ({b.start_date} → {b.end_date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre del Cliente</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre del cliente" />
              </div>
              <DatePickerField label="Fecha de Vencimiento" date={dueDate} onSelect={setDueDate} placeholder="Seleccionar fecha" />
            </div>
          </CardContent>
        </Card>

        {/* CFDI Fields */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos CFDI 4.0</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Serie</Label>
                <Input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="A" />
              </div>
              <div className="space-y-1.5">
                <Label>Folio</Label>
                <Input value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="001" />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de Pago</Label>
                <Select value={formaPago} onValueChange={setFormaPago}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMA_PAGO.map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Método de Pago</Label>
                <Select value={metodoPago} onValueChange={setMetodoPago}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METODO_PAGO.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Uso CFDI</Label>
                <Select value={usoCfdi} onValueChange={setUsoCfdi}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {USO_CFDI.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={moneda} onValueChange={(v) => { setMoneda(v); if (v === "MXN") setTipoCambio(1); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONEDA.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {moneda !== "MXN" && (
                <div className="space-y-1.5">
                  <Label>Tipo de Cambio</Label>
                  <Input type="number" step="0.0001" value={tipoCambio} onChange={(e) => setTipoCambio(Number(e.target.value))} />
                </div>
              )}
            </div>

            <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">Receptor</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>RFC Receptor</Label>
                <Input value={receptorRfc} onChange={(e) => setReceptorRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" />
              </div>
              <div className="space-y-1.5">
                <Label>Razón Social</Label>
                <Input value={receptorRazonSocial} onChange={(e) => setReceptorRazonSocial(e.target.value)} placeholder="Nombre legal del receptor" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Régimen Fiscal Receptor</Label>
                <Input value={receptorRegimenFiscal} onChange={(e) => setReceptorRegimenFiscal(e.target.value)} placeholder="601" />
              </div>
              <div className="space-y-1.5">
                <Label>C.P. Fiscal Receptor</Label>
                <Input value={receptorDomicilioFiscalCp} onChange={(e) => setReceptorDomicilioFiscalCp(e.target.value)} placeholder="06600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Partidas</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Agregar Fila</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-28">ClaveProdServ</TableHead>
                  <TableHead className="w-20">ClaveUnidad</TableHead>
                  <TableHead className="w-20">Cant.</TableHead>
                  <TableHead className="w-28">Precio Unit.</TableHead>
                  <TableHead className="w-28 text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Select value={item.clave_prod_serv || ""} onValueChange={(v) => updateItem(idx, "clave_prod_serv", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Código" /></SelectTrigger>
                        <SelectContent>
                          {CLAVE_PROD_SERV.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={item.clave_unidad || ""} onValueChange={(v) => updateItem(idx, "clave_unidad", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Unidad" /></SelectTrigger>
                        <SelectContent>
                          {CLAVE_UNIDAD.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min={0} value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} className="h-8" />
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.total)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lineItems.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Sin partidas aún</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono w-28 text-right">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">IVA (%)</span>
                <Input type="number" step="0.1" min={0} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="w-20 h-8 text-right" />
                <span className="font-mono w-28 text-right">{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex items-center gap-4 text-base font-bold border-t pt-2">
                <span>Total</span>
                <span className="font-mono w-28 text-right">{formatCurrency(total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <NotesCard value={notes} onChange={setNotes} placeholder="Notas adicionales…" />

        <FormActions submitLabel={isEdit ? "Actualizar Factura" : "Crear Factura"} isPending={isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
