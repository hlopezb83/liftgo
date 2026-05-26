import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { DateRange } from "react-day-picker";
import { useAvailableForklifts } from "@/features/fleet/hooks/forklifts/useAvailableForklifts";
import { bookingFormSchema, type BookingFormData } from "@/features/bookings/lib/bookingFormSchema";

export function useBookingFormState() {
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

  const { availableForklifts, forklifts, datesSelected } = useAvailableForklifts(dateRange);

  // Reset forklift selection si deja de estar disponible al cambiar fechas.
  useEffect(() => {
    if (forkliftId && datesSelected && !availableForklifts.some((f) => f.id === forkliftId)) {
      form.setValue("forklift_id", "");
    }
  }, [availableForklifts, forkliftId, datesSelected, form]);

  // Normaliza errores anidados de date_range a un único string.
  const dateRangeErrorObj = form.formState.errors.date_range as
    | { message?: string; from?: { message?: string }; to?: { message?: string } }
    | undefined;
  const dateRangeError = dateRangeErrorObj?.message
    ?? dateRangeErrorObj?.from?.message
    ?? dateRangeErrorObj?.to?.message;

  return { form, dateRange, forkliftId, availableForklifts, forklifts, datesSelected, dateRangeError };
}
