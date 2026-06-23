import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { bookingKeys } from "../lib/queryKeys";
import { forkliftKeys } from "@/features/fleet";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (booking: Omit<TablesInsert<"bookings">, "booking_number">) => {
      const { data, error } = await supabase.rpc("create_booking", {
        p_forklift_id: booking.forklift_id,
        p_customer_id: booking.customer_id ?? undefined,
        p_customer_name: booking.customer_name ?? undefined,
        p_customer_contact: booking.customer_contact ?? undefined,
        p_start_date: booking.start_date,
        p_end_date: booking.end_date,
        p_recurring_billing: booking.recurring_billing ?? false,
        p_quote_id: booking.quote_id ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      queryClient.invalidateQueries({ queryKey: forkliftKeys.all });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al crear reserva", error: err });
    },
  });
}

export function useUpdateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"bookings"> & { id: string }) => {
      const { data, error } = await supabase.from("bookings").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al actualizar reserva", error: err });
    },
  });
}

export function useDeleteBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      queryClient.invalidateQueries({ queryKey: forkliftKeys.all });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al eliminar reserva", error: err });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      queryClient.invalidateQueries({ queryKey: forkliftKeys.all });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al cancelar reserva", error: err });
    },
  });
}
