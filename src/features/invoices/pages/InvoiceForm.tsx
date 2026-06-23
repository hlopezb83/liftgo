import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { BookingWithForklift } from "@/features/bookings";
import { useInvoiceFormLogic } from "../hooks/useInvoiceFormLogic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { CfdiFieldsCard } from "../components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable } from "../components/invoice-form/EditableLineItemsTable";

import { AlertTriangle } from "lucide-react";
import { formatDateRange } from "@/lib/utils";
import { useNextInvoiceNumber } from "../hooks/invoices/useNextInvoiceNumber";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";
import { notifySuccess } from "@/lib/ui/appFeedback";

export default function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");

  const f = useInvoiceFormLogic({ id, fromQuoteId });
  const { data: nextNumber, isLoading: loadingNext } = useNextInvoiceNumber(!f.isEdit);

  const onSubmit = (values: InvoiceFormValues) => {
    const payload = f.onSubmit(values);
    if (f.isEdit && f.id) {
      f.updateInvoice.mutate({ id: f.id, ...payload }, {
        onSuccess: () => { notifySuccess("Factura actualizada"); navigate(`/invoices/${f.id}`); },
      });
    } else {
      f.createInvoice.mutate(payload, {
        onSuccess: (data) => {
          notifySuccess(`Factura ${data.invoice_number} creada`);
          if (f.fromQuoteId) f.updateQuote.mutate({ id: f.fromQuoteId, status: "accepted" });
          navigate(`/invoices/${data.id}`);
        },
      });
    }
  };

  if (f.saleAssignmentGuard.shouldBlock) {
    const { totalAssigned, totalRequired, missingByLine } = f.saleAssignmentGuard;
    return (
      <div className="p-6 max-w-4xl">
        <FormPageHeader title="Nueva Factura" />
        <Alert variant="destructive" className="mt-6">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>
            Asigna los equipos del inventario antes de facturar ({totalAssigned}/{totalRequired})
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-2">
            <p>Las siguientes partidas de venta tienen equipos pendientes de asignación:</p>
            <ul className="list-disc pl-5">
              {missingByLine.map((line) => (
                <li key={line.index}>
                  {line.description}: {line.assigned}/{line.required}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
        <div className="flex gap-3 mt-4">
          <Button onClick={() => navigate(`/quotes/${f.fromQuoteId}`)}>Ir a la cotización</Button>
          <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <FormPageHeader title={f.isEdit ? "Editar Factura" : "Nueva Factura"} />

      <Form {...f.form}>
        <form onSubmit={f.form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Detalles de Factura</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!f.isEdit && (
                <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                  <span className="text-sm text-muted-foreground">Folio próximo</span>
                  <span className="font-semibold text-primary">
                    {loadingNext ? "Calculando…" : (nextNumber ?? "—")}
                  </span>
                </div>
              )}
              {!f.isEdit && (
                <FormField control={f.form.control} name="bookingId" render={({ field }) => (
                  <FormItem>
                    <Label>Generar desde Reserva</Label>
                    <Select value={field.value} onValueChange={f.handleBookingSelect}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar reserva (opcional)" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {f.availableBookings?.map((booking) => (
                          <SelectItem key={booking.id} value={booking.id}>
                            {(booking as BookingWithForklift).forklifts?.name} — {booking.customer_name || "Sin cliente"} ({formatDateRange(booking.start_date, booking.end_date)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={f.form.control} name="customerId" render={({ field }) => (
                  <FormItem>
                    <Label>Cliente</Label>
                    <Select value={field.value || ""} onValueChange={f.handleCustomerSelect}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {f.customers?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` — ${c.company}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={f.form.control} name="issueDate" render={({ field }) => (
                  <FormItem>
                    <DatePickerField label="Fecha de Factura" date={field.value} onSelect={(d) => field.onChange(d || new Date())} placeholder="Seleccionar fecha" />
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={f.form.control} name="dueDate" render={({ field }) => (
                  <FormItem>
                    <DatePickerField label="Fecha de Vencimiento" date={field.value} onSelect={field.onChange} placeholder="Seleccionar fecha" />
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <CfdiFieldsCard />

          <EditableLineItemsTable />

          <TotalsSummary
            subtotal={f.subtotal}
            taxRate={f.form.watch("taxRate")}
            taxAmount={f.taxAmount}
            total={f.total}
            onTaxRateChange={(v) => f.form.setValue("taxRate", v, { shouldDirty: true })}
          />

          <Card>
            <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
            <CardContent>
              <FormField control={f.form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea placeholder="Notas adicionales…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <FormActions submitLabel={f.isEdit ? "Actualizar Factura" : "Crear Factura"} isPending={f.isPending} onCancel={() => navigate(-1)} />
        </form>
      </Form>
    </div>
  );
}
