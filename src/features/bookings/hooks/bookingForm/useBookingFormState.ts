import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useAvailableForklifts } from "@/features/fleet";
import { zodResolver } from "@/lib/forms/zodResolver";
import { emptyBookingForm } from "../../lib/bookingDraft";
import { bookingFormSchema, type BookingFormData } from "../../lib/bookingFormSchema";
import type { DateRange } from "react-day-picker";

export function useBookingFormState() {
  const form = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: emptyBookingForm(),
  });

  const dateRange = useWatch({ control: form.control, name: "date_range" }) as DateRange | undefined;
  const forkliftId = useWatch({ control: form.control, name: "forklift_id" });

  const { availableForklifts, forklifts, datesSelected, dateRangeError: availabilityDateRangeError, isSuccess: availabilitySettled, isLoading: availabilityLoading, isError: availabilityError, isFetching: availabilityFetching, refetch: revalidateAvailability } =
    useAvailableForklifts(dateRange);

  // Reset forklift selection si deja de estar disponible al cambiar fechas.
  // M-16: gatear con `isSuccess` — mientras la query de disponibilidad carga,
  // `availableForklifts` es [] por defecto y el efecto borraba la selección.
  useEffect(() => {
    if (!availabilitySettled) return;
    if (forkliftId && datesSelected && !availableForklifts.some((f) => f.id === forkliftId)) {
      form.setValue("forklift_id", "");
    }
  }, [availableForklifts, forkliftId, datesSelected, availabilitySettled, form]);

  // Normaliza errores anidados de date_range a un único string.
  const dateRangeErrorObj = form.formState.errors.date_range as
    | { message?: string; from?: { message?: string }; to?: { message?: string } }
    | undefined;
  const dateRangeError = availabilityDateRangeError ?? dateRangeErrorObj?.message
    ?? dateRangeErrorObj?.from?.message
    ?? dateRangeErrorObj?.to?.message;

  return { form, dateRange, forkliftId, availableForklifts, forklifts, datesSelected, dateRangeError, revalidateAvailability, availabilityLoading, availabilityError, availabilityFetching };
}
