import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CustomerSelector } from "@/features/customers/components/customers/CustomerSelector";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { ForkliftSelector } from "@/features/fleet/components/fleet/ForkliftSelector";
import { BookingPostDialogs } from "@/features/bookings/components/bookings/BookingPostDialogs";
import { differenceInDays } from "date-fns";
import { useBookingFormLogic } from "@/features/bookings/hooks/bookingForm/useBookingFormLogic";

export default function BookingForm() {
  const {
    form, customers, createBooking,
    dateRange, forkliftId,
    availableForklifts, datesSelected,
    onSubmit,
    postBooking, showPolicyDialog,
    handleDeliveryDone, handlePolicyDone,
    selectedForklift,
    dateRangeError,
    navigate,
  } = useBookingFormLogic();

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const showRecurring = Boolean(startDate && endDate && differenceInDays(endDate, startDate) >= 30);
  const forkliftName = selectedForklift?.name ?? "";

  const handleCustomerIdChange = (v: string) => {
    form.setValue("customer_id", v);
    const c = customers?.find((item) => item.id === v);
    if (!c) return;
    form.setValue("customer_name", c.name);
    if (c.email) form.setValue("customer_contact", c.email);
  };

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
            {showRecurring && (
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
          onCustomerIdChange={handleCustomerIdChange}
          onCustomerNameChange={(v) => form.setValue("customer_name", v)}
          customerContact={form.watch("customer_contact")}
          onCustomerContactChange={(v) => form.setValue("customer_contact", v)}
        />
        <FormActions submitLabel="Crear Reserva" isPending={createBooking.isPending} onCancel={() => navigate(-1)} />
      </form>
      <BookingPostDialogs
        postBooking={postBooking}
        showPolicyDialog={showPolicyDialog}
        forkliftName={forkliftName}
        onDeliveryDone={handleDeliveryDone}
        onPolicyDone={handlePolicyDone}
      />
    </div>
  );
}
