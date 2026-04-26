import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { useCustomers } from "@/hooks/useCustomers";
import { useCreateBooking } from "@/hooks/useBookings";
import { useAvailableForklifts } from "@/hooks/useAvailableForklifts";
import { useMaintenancePolicies } from "@/hooks/useMaintenancePolicies";
import { bookingFormSchema, type BookingFormData } from "@/lib/formSchemas";

interface PostBookingState {
  bookingId: string;
  forkliftId: string;
  startDate: string;
  customerAddress: string | null;
}

/**
 * Encapsula todo el estado y los handlers de BookingForm:
 * formulario, sincronización de forklift disponible, y los diálogos
 * post-creación (entrega y política de mantenimiento).
 */
export function useBookingFormLogic() {
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: policies } = useMaintenancePolicies();
  const createBooking = useCreateBooking();
  const [postBooking, setPostBooking] = useState<PostBookingState | null>(null);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);

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

  const handleDeliveryDone = () => {
    const hasPolicy = policies?.some(
      (p) => p.forklift_id === postBooking?.forkliftId && p.is_active
    );
    if (!hasPolicy && postBooking) {
      setShowPolicyDialog(true);
    } else {
      setPostBooking(null);
      toast.success("Reserva creada");
      navigate("/calendar");
    }
  };

  const handlePolicyDone = () => {
    setShowPolicyDialog(false);
    setPostBooking(null);
    toast.success("Reserva creada");
    navigate("/calendar");
  };

  // Normaliza errores anidados de date_range a un único string.
  const dateRangeErrorObj = form.formState.errors.date_range as
    | { message?: string; from?: { message?: string }; to?: { message?: string } }
    | undefined;
  const dateRangeError = dateRangeErrorObj?.message
    ?? dateRangeErrorObj?.from?.message
    ?? dateRangeErrorObj?.to?.message;

  const selectedForklift = forklifts?.find((f) => f.id === postBooking?.forkliftId);

  return {
    form, customers, createBooking,
    dateRange, forkliftId,
    availableForklifts, datesSelected,
    onSubmit,
    postBooking, showPolicyDialog,
    handleDeliveryDone, handlePolicyDone,
    selectedForklift,
    dateRangeError,
    navigate,
  };
}
