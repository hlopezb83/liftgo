import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
export type { Booking, BookingWithForklift } from "@/types/rental";

export function useBookings(forkliftId?: string) {
  return useQuery({
    queryKey: ["bookings", forkliftId],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase.from("bookings").select("*, forklifts(name, model)").order("start_date", { ascending: false }).limit(500);
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useBooking(bookingId?: string) {
  return useQuery({
    queryKey: ["booking", bookingId],
    enabled: !!bookingId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
        .eq("id", bookingId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

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
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      toast.error("Error al crear reserva", { description: err.message });
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
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      toast.error("Error al actualizar reserva", { description: err.message });
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
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
    },
    onError: (err: Error) => {
      toast.error("Error al eliminar reserva", { description: err.message });
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
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      toast.error("Error al cancelar reserva", { description: err.message });
    },
  });
}
