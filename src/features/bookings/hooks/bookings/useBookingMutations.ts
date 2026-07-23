import { forkliftKeys } from "@/features/fleet";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bookingKeys } from "../../lib/queryKeys";

export function useCreateBooking() {
  return useEntityMutation({
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
    invalidateKeys: [bookingKeys.all, forkliftKeys.all, ["status_logs"] as const],
    errorTitle: "Error al crear reserva",
  });
}

export function useUpdateBooking() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"bookings"> & { id: string }) => {
      const { data, error } = await supabase.from("bookings").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [bookingKeys.all],
    errorTitle: "Error al actualizar reserva",
  });
}

export function useDeleteBooking() {
  // v7.217.0 (C5a): RPC transaccional. Elimina la reserva y regresa el
  // equipo a `available` + registra en `status_logs` en una sola transacción.
  // El guard SQL sólo permite borrar reservas cancelled/completed.
  return useEntityMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("delete_booking", { p_booking_id: bookingId });
      if (error) throw error;
    },
    invalidateKeys: [bookingKeys.all, forkliftKeys.all, ["status_logs"] as const],
    errorTitle: "Error al eliminar reserva",
  });
}

export function useCancelBooking() {
  return useEntityMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
      if (error) throw error;
    },
    invalidateKeys: [bookingKeys.all, forkliftKeys.all, ["status_logs"] as const],
    errorTitle: "Error al cancelar reserva",
  });
}
