import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bookingKeys } from "../lib/queryKeys";

export function useBookingExtensions(bookingId?: string) {
  return useQuery({
    queryKey: bookingId ? bookingKeys.extensions(bookingId) : [...bookingKeys.all, "extensions"],
    enabled: !!bookingId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_extensions")
        .select("*")
        .eq("booking_id", bookingId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateBookingExtension() {
  return useEntityMutation({
    mutationFn: async (ext: { booking_id: string; original_end_date: string; new_end_date: string; reason?: string }) => {
      const { data: updated, error: bookingError } = await supabase
        .from("bookings")
        .update({ end_date: ext.new_end_date })
        .eq("id", ext.booking_id)
        .select("id");
      if (bookingError) throw bookingError;
      assertRowsAffected(updated, "Extender reserva");

      const { data, error } = await supabase
        .from("booking_extensions")
        .insert(ext)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeysFn: (_d, vars) => [bookingKeys.extensions(vars.booking_id), bookingKeys.all],
    successMsg: "Reserva extendida exitosamente",
    errorTitle: "Error al extender reserva",
  });
}

