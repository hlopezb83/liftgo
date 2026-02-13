import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export function useReturnInspections(forkliftId?: string) {
  return useQuery({
    queryKey: ["return_inspections", forkliftId],
    queryFn: async () => {
      let query = supabase.from("return_inspections").select("*, bookings(customer_name, start_date, end_date), forklifts(name, model)").order("inspected_at", { ascending: false });
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateReturnInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inspection: TablesInsert<"return_inspections">) => {
      const { data, error } = await supabase.from("return_inspections").insert(inspection).select().single();
      if (error) throw error;

      // Update booking return_status
      await supabase.from("bookings").update({ return_status: "returned", status: "completed" }).eq("id", inspection.booking_id);

      // Update forklift status back to available
      await supabase.from("forklifts").update({ status: "available" }).eq("id", inspection.forklift_id);

      // Log status change
      await supabase.from("status_logs").insert({
        forklift_id: inspection.forklift_id,
        from_status: "rented",
        to_status: "available",
        note: `Returned — condition: ${inspection.condition || "good"}`,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return_inspections"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["status_logs"] });
    },
  });
}
