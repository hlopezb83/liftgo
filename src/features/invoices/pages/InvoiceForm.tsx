import { useNavigate } from "react-router-dom";
import type { BookingWithForklift } from "@/hooks/useBookings";
import { useInvoiceFormLogic } from "@/features/invoices/hooks/useInvoiceFormLogic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { NotesCard } from "@/components/NotesCard";
import { TotalsSummary } from "@/components/TotalsSummary";
import { CfdiFieldsCard } from "@/features/invoices/components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable } from "@/features/invoices/components/invoice-form/EditableLineItemsTable";
import { toast } from "sonner";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import { useNextInvoiceNumber } from "@/hooks/useNextInvoiceNumber";

export default function InvoiceForm() {
  const navigate = useNavigate();
  const form = useInvoiceFormLogic();
  const { data: nextNumber, isLoading: loadingNext } = useNextInvoiceNumber(!form.isEdit);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.lineItems.length === 0) { toast.error("Agrega al menos una partida"); return; }

    const payload = form.buildPayload();

    if (form.isEdit) {
      form.updateInvoice.mutate({ id: form.id!, ...payload }, {
        onSuccess: () => { toast.success("Factura actualizada"); navigate(`/invoices/${form.id}`); },
      });
    } else {
      form.createInvoice.mutate(payload, {
        onSuccess: (data) => {
          toast.success(`Factura ${data.invoice_number} creada`);
          if (form.fromQuoteId) {
            form.updateQuote.mutate({ id: form.fromQuoteId, status: "accepted" });
          }
          navigate(`/invoices/${data.id}`);
        },
      });
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <FormPageHeader title={form.isEdit ? "Editar Factura" : "Nueva Factura"} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de Factura</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!form.isEdit && (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Folio próximo</span>
                <span className="font-semibold text-primary">
                  {loadingNext ? "Calculando…" : (nextNumber ?? "—")}
                </span>
              </div>
            )}
            {!form.isEdit && (
              <div className="space-y-1.5">
                <Label>Generar desde Reserva</Label>
                <Select value={form.bookingId} onValueChange={form.handleBookingSelect}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar reserva (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {form.availableBookings?.map((booking) => (
                      <SelectItem key={booking.id} value={booking.id}>
                        {(booking as BookingWithForklift).forklifts?.name} — {booking.customer_name || "Sin cliente"} ({formatDateRange(booking.start_date, booking.end_date)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={form.customerId || ""} onValueChange={form.handleCustomerSelect}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {form.customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>{customer.name}{customer.company && customer.company !== customer.name ? ` — ${customer.company}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DatePickerField label="Fecha de Factura" date={form.issueDate} onSelect={(d) => form.setIssueDate(d || new Date())} placeholder="Seleccionar fecha" />
              <DatePickerField label="Fecha de Vencimiento" date={form.dueDate} onSelect={form.setDueDate} placeholder="Seleccionar fecha" />
            </div>
          </CardContent>
        </Card>

        <CfdiFieldsCard
          serie={form.cfdi.serie} folio={form.cfdi.folio} formaPago={form.cfdi.formaPago} metodoPago={form.cfdi.metodoPago}
          usoCfdi={form.cfdi.usoCfdi} moneda={form.cfdi.moneda} tipoCambio={form.cfdi.tipoCambio}
          receptorRfc={form.cfdi.receptorRfc} receptorRazonSocial={form.cfdi.receptorRazonSocial}
          receptorRegimenFiscal={form.cfdi.receptorRegimenFiscal} receptorDomicilioFiscalCp={form.cfdi.receptorDomicilioFiscalCp}
          onUpdate={form.handleCfdiUpdate}
        />

        <EditableLineItemsTable
          lineItems={form.lineItems}
          onUpdateItem={form.updateLineItem}
          onAddItem={form.addLineItem}
          onRemoveItem={form.removeLineItem}
        />

        <TotalsSummary subtotal={form.subtotal} taxRate={form.taxRate} taxAmount={form.taxAmount} total={form.total} onTaxRateChange={form.setTaxRate} />

        <NotesCard value={form.notes} onChange={form.setNotes} placeholder="Notas adicionales…" />

        <FormActions submitLabel={form.isEdit ? "Actualizar Factura" : "Crear Factura"} isPending={form.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
