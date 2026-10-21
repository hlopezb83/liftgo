
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { customerQueries, useCustomers } from "@/features/customers";
import { useMaintenancePolicies } from "@/features/maintenance";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { toYMD } from "@/lib/format/dateFormats";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { allowsRecurringBilling } from "../../lib/recurringBillingEligibility";
import { useCreateBooking } from "../bookings/useBookings";
import type { BookingFormData } from "../../lib/bookingFormSchema";

interface PostBookingState {
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  endDate: string;
  customerAddress: string | null;
}

interface SubmitOptions {
  canSubmit: () => boolean;
  captureCompletion: () => () => void;
  revalidateAvailability: () => Promise<{ data?: { id: string; name: string }[]; isError: boolean }>;
}

export function useBookingFormSubmit(options: SubmitOptions) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const navigate = useNavigateTransition();
  const isMounted = useIsMounted();
  const { data: customers } = useCustomers();
  const { data: policies } = useMaintenancePolicies();
  const createBooking = useCreateBooking();
  const [postBooking, setPostBooking] = useState<PostBookingState | null>(null);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);

  const onSubmit = async (data: BookingFormData, forkliftName: string) => {
    if (inFlight.current || !options.canSubmit()) return;
    const { from, to } = data.date_range;
    if (!from || !to) return;
    inFlight.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const { freshForklift, selectedCustomer } = await freshBookingReferences(data, options, queryClient);
      if (!isMounted() || !options.canSubmit()) return;
      const complete = options.captureCompletion();
      let bookingId: string;
      try {
        bookingId = await createBooking.mutateAsync(bookingPayload(data, from, to, selectedCustomer?.name));
      } catch {
        // The mutation owns the translated backend error. Preserve the draft.
        return;
      }
      complete();
      if (!isMounted()) return;
      setPostBooking(postBookingState(bookingId, data.forklift_id, freshForklift.name || forkliftName, from, to, selectedCustomer));
    } catch (error) {
      if (isMounted()) setSubmitError(error instanceof BookingReferenceError ? error.message : "No se pudo validar el cliente o la disponibilidad actual. Revisa la selección y vuelve a intentar; tu captura se conserva.");
    } finally {
      inFlight.current = false;
      if (isMounted()) setIsSubmitting(false);
    }
  };

  const handleDeliveryDone = () => {
    const hasPolicy = policies?.some(
      (p) => p.forklift_id === postBooking?.forkliftId && p.is_active
    );
    if (!hasPolicy && postBooking) {
      setShowPolicyDialog(true);
    } else {
      setPostBooking(null);
      notifySuccess("Reserva creada");
      navigate("/calendar");
    }
  };

  const handlePolicyDone = () => {
    setShowPolicyDialog(false);
    setPostBooking(null);
    notifySuccess("Reserva creada");
    navigate("/calendar");
  };

  return {
    customers, createBooking, navigate, isSubmitting, submitError,
    postBooking, showPolicyDialog,
    onSubmit, handleDeliveryDone, handlePolicyDone,
  };
}

function bookingPayload(data: BookingFormData, from: Date, to: Date, customerName: string | undefined) {
  return {
    forklift_id: data.forklift_id, start_date: toYMD(from), end_date: toYMD(to),
    customer_name: customerName || data.customer_name || null,
    customer_contact: data.customer_contact?.trim() || null,
    customer_id: data.customer_id || null, status: "confirmed" as const,
    recurring_billing: Boolean(data.recurring_billing && allowsRecurringBilling(from, to)),
  };
}
function postBookingState(bookingId: string, forkliftId: string, forkliftName: string, from: Date, to: Date, customer: { address: string | null } | null): PostBookingState {
  return { bookingId, forkliftId, forkliftName, startDate: toYMD(from), endDate: toYMD(to), customerAddress: customer?.address || null };
}

class BookingReferenceError extends Error {}
async function freshBookingReferences(data: BookingFormData, options: SubmitOptions, queryClient: QueryClient) {
  // Never trust a restored ID, cached catalogue or old availability result.
  const [availability, selectedCustomer] = await Promise.all([
    options.revalidateAvailability(),
    data.customer_id ? queryClient.fetchQuery({ ...customerQueries.detail(data.customer_id), staleTime: 0 }) : Promise.resolve(null),
  ]);
  if (availability.isError) throw new BookingReferenceError("No pudimos verificar la disponibilidad. Intenta de nuevo.");
  const freshForklift = availability.data?.find((item) => item.id === data.forklift_id);
  if (!freshForklift) throw new BookingReferenceError("El equipo ya no está disponible para esas fechas. Selecciona otro equipo.");
  if (data.customer_id && !selectedCustomer) throw new BookingReferenceError("El cliente ya no está activo en esta empresa. Selecciona otro cliente.");
  return { freshForklift, selectedCustomer };
}
