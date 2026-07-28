import { DatePickerField } from "@/components/forms/DatePickerField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { CustomerSelector } from "@/features/customers";
import { useNextInvoiceNumber } from "../../hooks/invoices/useNextInvoiceNumber";
import { MultiBookingSelector } from "./MultiBookingSelector";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface Customer { id: string; name: string; company?: string | null }
interface Booking { id: string; [k: string]: unknown }

interface Props {
  isEdit: boolean;
  form: UseFormReturn<InvoiceFormValues>;
  customers: Customer[] | undefined;
  availableBookings: Booking[] | undefined;
  handleCustomerSelect: (id: string) => void;
  handleBookingsChange: (ids: string[]) => void;
}

export function InvoiceDetailsCard({
  isEdit, form, customers, availableBookings, handleCustomerSelect, handleBookingsChange,
}: Props) {
  const { data: nextNumber, isLoading: loadingNext } = useNextInvoiceNumber(!isEdit);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Detalles de Factura</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {!isEdit && (
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
        {!isEdit && (
          <FormField control={form.control} name="bookingIds" render={({ field }) => (
            <FormItem>
              <Label>Generar desde Reserva(s)</Label>
              <FormControl>
                <MultiBookingSelector
                  bookings={(availableBookings ?? []) as Parameters<typeof MultiBookingSelector>[0]["bookings"]}
                  selectedIds={field.value ?? []}
                  onChange={handleBookingsChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormField control={form.control} name="customerId" render={({ field }) => (
            <FormItem>
              <Label>Cliente</Label>
              <Select value={field.value || ""} onValueChange={handleCustomerSelect}>
                <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger></FormControl>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.company && c.company !== c.name ? ` — ${c.company}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="issueDate" render={({ field }) => (
            <FormItem>
              <DatePickerField label="Fecha de Factura" date={field.value} onSelect={(d) => field.onChange(d || new Date())} placeholder="Seleccionar fecha" />
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="dueDate" render={({ field }) => (
            <FormItem>
              <DatePickerField label="Fecha de Vencimiento" date={field.value} onSelect={field.onChange} placeholder="Seleccionar fecha" />
              <FormMessage />
            </FormItem>
          )} />
        </div>
      </CardContent>
    </Card>
  );
}
