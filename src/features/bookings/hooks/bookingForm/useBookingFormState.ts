import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useAvailableForklifts } from "@/features/fleet";
import { zodResolver } from "@/lib/forms/zodResolver";
import { bookingFormSchema, type BookingFormData } from "../../lib/bookingFormSchema";
import type { DateRange } from "react-day-picker";

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

  const dateRange = useWatch({ control: form.control, name: "date_range" }) as DateRange | undefined;
  const forkliftId = useWatch({ control: form.control, name: "forklift_id" });

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
