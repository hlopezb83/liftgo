import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { useCustomers } from "@/features/customers/hooks/customers/useCustomers";
import { useCreateBooking } from "@/features/bookings/hooks/useBookings";
import { useMaintenancePolicies } from "@/features/maintenance/hooks/maintenance/useMaintenancePolicies";
import type { BookingFormData } from "@/lib/formSchemas";

interface PostBookingState {
  bookingId: string;
  forkliftId: string;
  startDate: string;
  customerAddress: string | null;
}

export function useBookingFormSubmit() {
  const navigate = useNavigate();
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
        start_date: format(from, "yyyy-MM-dd"),
        end_date: format(to, "yyyy-MM-dd"),
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
            startDate: format(from, "yyyy-MM-dd"),
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

  return {
    customers, createBooking, navigate,
    postBooking, showPolicyDialog,
    onSubmit, handleDeliveryDone, handlePolicyDone,
  };
}
