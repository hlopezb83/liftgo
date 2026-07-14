import { useWatch } from "react-hook-form";
import { useParams, useSearchParams } from "react-router";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { WarnIcon } from "@/components/icons";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CfdiFieldsCard } from "../components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable } from "../components/invoice-form/EditableLineItemsTable";
import { MultiBookingSelector } from "../components/invoice-form/MultiBookingSelector";
import { useNextInvoiceNumber } from "../hooks/invoices/useNextInvoiceNumber";
import { useInvoiceFormLogic } from "../hooks/useInvoiceFormLogic";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";

export default function InvoiceForm() {
  const navigate = useNavigateTransition();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");

  const f = useInvoiceFormLogic({ id, fromQuoteId });
  const { data: nextNumber, isLoading: loadingNext } = useNextInvoiceNumber(!f.isEdit);
  const taxRate = useWatch({ control: f.form.control, name: "taxRate" });

  const onSubmit = (values: InvoiceFormValues) => {
    const payload = f.onSubmit(values);
    const bookingIds = values.bookingIds ?? [];
    if (f.isEdit && f.id) {
      const invoiceId = f.id;
      f.updateInvoice.mutate({ id: invoiceId, ...payload }, {
        onSuccess: async () => {
          await f.syncInvoiceBookings.mutateAsync({ invoiceId, bookingIds });
          notifySuccess("Factura actualizada");
          navigate(`/invoices/${invoiceId}`);
        },
      });
    } else {
      f.createInvoice.mutate(payload, {
        onSuccess: async (data) => {
          await f.syncInvoiceBookings.mutateAsync({ invoiceId: data.id, bookingIds });
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
      <PageContainer maxWidth="wide">
        <FormPageHeader title="Nueva Factura" />
        <Alert variant="destructive" className="mt-6">
          <WarnIcon className="h-5 w-5" />
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
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <FormPageHeader title={f.isEdit ? "Editar Factura" : "Nueva Factura"} />

      <Form {...f.form}>
        <form onSubmit={f.form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Detalles de Factura</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!f.isEdit && (
                <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Folio próximo</span>
                    <span className="text-2xs text-muted-foreground/80">Tentativo · se asigna al guardar</span>
                  </div>
                  <span className="font-semibold text-primary">
                    {loadingNext ? "Calculando…" : (nextNumber ?? "—")}
                  </span>
                </div>
              )}
              {!f.isEdit && (
                <FormField control={f.form.control} name="bookingIds" render={({ field }) => (
                  <FormItem>
                    <Label>Generar desde Reserva(s)</Label>
                    <FormControl>
                      <MultiBookingSelector
                        bookings={f.availableBookings ?? []}
                        selectedIds={field.value ?? []}
                        onChange={f.handleBookingsChange}
                      />
                    </FormControl>
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
            taxRate={taxRate}
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
    </PageContainer>
  );
}
