import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateBooking } from "@/hooks/useBookings";
import { useAvailableForklifts } from "@/hooks/useAvailableForklifts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { ForkliftSelector } from "@/components/ForkliftSelector";
import { PostBookingDeliveryDialog } from "@/components/PostBookingDeliveryDialog";
import { PostBookingPolicyDialog } from "@/components/PostBookingPolicyDialog";
import { useMaintenancePolicies } from "@/hooks/useMaintenancePolicies";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { bookingFormSchema, type BookingFormData } from "@/lib/formSchemas";
import type { DateRange } from "react-day-picker";

interface PostBookingState { bookingId: string; forkliftId: string; startDate: string; customerAddress: string | null; }

export default function BookingForm() {
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const createBooking = useCreateBooking();
  const [postBooking, setPostBooking] = useState<PostBookingState | null>(null);

  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      forklift_id: "",
      date_range: { from: undefined, to: undefined },
      customer_id: "",
      customer_name: "",
      customer_contact: "",
      recurring_billing: false,
    },
  });

  const dateRange = form.watch("date_range") as DateRange | undefined;
  const forkliftId = form.watch("forklift_id");
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  const { availableForklifts, forklifts, datesSelected } = useAvailableForklifts(dateRange);

  useEffect(() => {
    if (forkliftId && datesSelected && !availableForklifts.some((f) => f.id === forkliftId)) {
      form.setValue("forklift_id", "");
    }
  }, [availableForklifts, forkliftId, datesSelected, form]);

  const onSubmit = (data: BookingFormData) => {
    const selectedCustomer = customers?.find((c) => c.id === data.customer_id);
    createBooking.mutate(
      {
        forklift_id: data.forklift_id,
        start_date: format(data.date_range.from!, "yyyy-MM-dd"),
        end_date: format(data.date_range.to!, "yyyy-MM-dd"),
        customer_name: selectedCustomer?.name || data.customer_name || null,
        customer_contact: selectedCustomer?.email || data.customer_contact || null,
        customer_id: data.customer_id || null,
        status: "confirmed",
        recurring_billing: data.recurring_billing,
      },
      {
        onSuccess: (bookingId: string) => {
          const cust = customers?.find((c) => c.id === data.customer_id);
          setPostBooking({
            bookingId,
            forkliftId: data.forklift_id,
            startDate: format(data.date_range.from!, "yyyy-MM-dd"),
            customerAddress: cust?.address || null,
          });
        },
      }
    );
  };

  const handleSkipDelivery = () => { setPostBooking(null); toast.success("Reserva creada"); navigate("/calendar"); };
  const selectedForklift = forklifts?.find((f) => f.id === postBooking?.forkliftId);

  const dateRangeError = form.formState.errors.date_range?.message
    ?? (form.formState.errors.date_range as any)?.from?.message
    ?? (form.formState.errors.date_range as any)?.to?.message;

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title="Nueva Reserva" />
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de la Reserva</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <DateRangePickerField
              label="Fechas de Reserva"
              dateRange={dateRange}
              onSelect={(range) => form.setValue("date_range", { from: range?.from, to: range?.to }, { shouldValidate: true })}
              required
              error={dateRangeError}
            />
            <ForkliftSelector
              value={forkliftId}
              onValueChange={(v) => form.setValue("forklift_id", v, { shouldValidate: true })}
              availableForklifts={availableForklifts}
              datesSelected={datesSelected}
              showStatus
              error={form.formState.errors.forklift_id?.message}
            />
            {startDate && endDate && differenceInDays(endDate, startDate) >= 30 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div>
                  <p className="text-sm font-medium">Habilitar Facturación Recurrente</p>
                  <p className="text-xs text-muted-foreground">Generar facturas mensuales automáticamente para esta reserva</p>
                </div>
                <Switch checked={form.watch("recurring_billing")} onCheckedChange={(v) => form.setValue("recurring_billing", v)} />
              </div>
            )}
          </CardContent>
        </Card>
        <CustomerSelector
          customers={customers}
          customerId={form.watch("customer_id")}
          customerName={form.watch("customer_name")}
          onCustomerIdChange={(v) => {
            form.setValue("customer_id", v);
            const c = customers?.find((c) => c.id === v);
            if (c) {
              form.setValue("customer_name", c.name);
              if (c.email) form.setValue("customer_contact", c.email);
            }
          }}
          onCustomerNameChange={(v) => form.setValue("customer_name", v)}
          customerContact={form.watch("customer_contact")}
          onCustomerContactChange={(v) => form.setValue("customer_contact", v)}
        />
        <FormActions submitLabel="Crear Reserva" isPending={createBooking.isPending} onCancel={() => navigate(-1)} />
      </form>
      {postBooking && (
        <PostBookingDeliveryDialog open={!!postBooking} onOpenChange={(open) => { if (!open) handleSkipDelivery(); }} bookingId={postBooking.bookingId} forkliftId={postBooking.forkliftId} forkliftName={selectedForklift?.name || ""} startDate={postBooking.startDate} customerAddress={postBooking.customerAddress} onSkip={handleSkipDelivery} />
      )}
    </div>
  );
}
