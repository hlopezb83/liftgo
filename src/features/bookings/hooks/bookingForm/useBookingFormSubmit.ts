
import { toYMD } from "@/lib/format/dateFormats";
import { useState } from "react";
import { useCustomers } from "@/features/customers";
import { useMaintenancePolicies } from "@/features/maintenance";
import { useIsMounted } from "@/hooks/useIsMounted";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useCreateBooking } from "../useBookings";
import type { BookingFormData } from "../../lib/bookingFormSchema";

interface PostBookingState {
  bookingId: string;
  forkliftId: string;
  startDate: string;
  customerAddress: string | null;
}

export function useBookingFormSubmit() {
  const navigate = useNavigateTransition();
  const isMounted = useIsMounted();
  const { data: customers } = useCustomers();
  const { data: policies } = useMaintenancePolicies();
  const createBooking = useCreateBooking();
  const [postBooking, setPostBooking] = useState<PostBookingState | null>(null);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);

  const onSubmit = (data: BookingFormData) => {
    const { from, to } = data.date_range;
    if (!from || !to) return;
    const selectedCustomer = customers?.find((c) => c.id === data.customer_id);
    createBooking.mutate(
      {
        forklift_id: data.forklift_id,
        start_date: toYMD(from),
        end_date: toYMD(to),
        customer_name: selectedCustomer?.name || data.customer_name || null,
        customer_contact: selectedCustomer?.email || data.customer_contact || null,
        customer_id: data.customer_id || null,
        status: "confirmed",
        recurring_billing: data.recurring_billing,
      },
      {
        onSuccess: (bookingId: string) => {
          // Si el usuario ya navegó fuera del formulario, evita el setState
          // sobre un componente desmontado (warning de React).
          if (!isMounted()) return;
          const cust = customers?.find((c) => c.id === data.customer_id);
          setPostBooking({
            bookingId,
            forkliftId: data.forklift_id,
            startDate: toYMD(from),
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
    customers, createBooking, navigate,
    postBooking, showPolicyDialog,
    onSubmit, handleDeliveryDone, handlePolicyDone,
  };
}
