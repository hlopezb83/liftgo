import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useBookingExtensions(bookingId?: string) {
  return useQuery({
    queryKey: ["booking_extensions", bookingId],
    enabled: !!bookingId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_extensions")
        .select("*")
        .eq("booking_id", bookingId!)
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
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({ end_date: ext.new_end_date })
        .eq("id", ext.booking_id);
      if (bookingError) throw bookingError;

      // Record extension
      const { data, error } = await supabase
        .from("booking_extensions" as any)
        .insert(ext as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["booking_extensions", variables.booking_id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      toast.success("Reserva extendida exitosamente");
    },
    onError: (err: Error) => toast.error("Error al extender reserva", { description: err.message }),
  });
}
