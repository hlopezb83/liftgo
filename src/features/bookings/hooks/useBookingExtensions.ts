import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { bookingKeys } from "@/features/bookings/lib/queryKeys";
import { toast } from "sonner";

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ext: { booking_id: string; original_end_date: string; new_end_date: string; reason?: string }) => {
      // Update booking end_date
      const { data: updated, error: bookingError } = await supabase
        .from("bookings")
        .update({ end_date: ext.new_end_date })
        .eq("id", ext.booking_id)
        .select("id");
      if (bookingError) throw bookingError;
      assertRowsAffected(updated, "Extender reserva");


      // Record extension
      const { data, error } = await supabase
        .from("booking_extensions")
        .insert(ext)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.extensions(variables.booking_id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      toast.success("Reserva extendida exitosamente");
    },
    onError: (err: Error) => notifyError({ title: "Error al extender reserva", error: err }),
  });
}
