import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Booking = Tables<"bookings">;
export type BookingWithForklift = Booking & {
  forklifts: { name: string; model: string } | null;
};

export function useBookings(forkliftId?: string) {
  return useQuery({
    queryKey: ["bookings", forkliftId],
    queryFn: async () => {
      let query = supabase.from("bookings").select("*, forklifts(name, model)").order("start_date");
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data as BookingWithForklift[];
    },
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: TablesInsert<"bookings">) => {
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
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Failed to create booking", description: err.message, variant: "destructive" })
      );
    },
  });
}

export function useUpdateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"bookings"> & { id: string }) => {
      const { data, error } = await supabase.from("bookings").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Failed to update booking", description: err.message, variant: "destructive" })
      );
    },
  });
}
