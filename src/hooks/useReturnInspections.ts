import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export function useReturnInspections(forkliftId?: string) {
  return useQuery({
    queryKey: ["return_inspections", forkliftId],
    staleTime: 60_000,
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
      const { data, error } = await supabase.rpc("complete_return_inspection", {
        p_booking_id: inspection.booking_id,
        p_forklift_id: inspection.forklift_id,
        p_condition: inspection.condition ?? "good",
        p_damage_notes: inspection.damage_notes ?? undefined,
        p_damage_cost: inspection.damage_cost ?? 0,
        p_hours_used: inspection.hours_used ?? undefined,
        p_fuel_level: inspection.fuel_level ?? undefined,
        p_inspected_by: inspection.inspected_by ?? undefined,
        p_inspected_at: (inspection as any).inspected_at ?? new Date().toISOString(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return_inspections"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["forklifts"] });
      qc.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al completar inspección de retorno", description: err.message, variant: "destructive" })
      );
    },
  });
}
