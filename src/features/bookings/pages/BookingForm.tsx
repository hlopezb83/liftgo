import { differenceInDays } from "date-fns";
import { useWatch } from "react-hook-form";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { SwitchField } from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerSelector } from "@/features/customers";
import { ForkliftSelector } from "@/features/fleet";
import { BookingPostDialogs } from "../components/bookings/BookingPostDialogs";
import { useBookingFormLogic } from "../hooks/bookingForm/useBookingFormLogic";

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

  // Suscripciones aisladas: cambian sin re-renderizar el árbol de la reserva.
  const [customerId, customerName, customerContact] = useWatch({
    control: form.control,
    name: ["customer_id", "customer_name", "customer_contact"],
  });

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
    <PageContainer maxWidth="form">
      <FormPageHeader title="Nueva Reserva" />
      <form onSubmit={form.handleSubmit((data) => onSubmit(data, forkliftName))} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de la Reserva</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <DateRangePickerField
              label="Fechas de Reserva"
              dateRange={dateRange}
              onSelect={(range) => form.setValue("date_range", { from: range?.from, to: range?.to }, { shouldValidate: true })}
              required
              error={dateRangeError}
              helperText="La fecha fin es inclusiva; el equipo queda ocupado ese día. Para una renta consecutiva el mismo día que otra termina, inicia al día siguiente."
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
              <SwitchField
                control={form.control}
                name="recurring_billing"
                label="Habilitar Facturación Recurrente"
                description="Generar facturas mensuales automáticamente para esta reserva"
              />
            )}
          </CardContent>
        </Card>
        <CustomerSelector
          customers={customers}
          customerId={customerId}
          customerName={customerName}
          onCustomerIdChange={handleCustomerIdChange}
          onCustomerNameChange={(v) => form.setValue("customer_name", v)}
          customerContact={customerContact}
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
    </PageContainer>
  );
}
