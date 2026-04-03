import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { nowMty } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";

export function useReturnInspection(id?: string) {
  return useQuery({
    queryKey: ["return_inspections", "detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("return_inspections").select("*, bookings(customer_name, start_date, end_date), forklifts(name, model)").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inspection: Omit<TablesInsert<"return_inspections">, "inspection_number">) => {
      const { data, error } = await supabase.rpc("complete_return_inspection", {
        p_booking_id: inspection.booking_id,
        p_forklift_id: inspection.forklift_id,
        p_condition: inspection.condition ?? "good",
        p_damage_notes: inspection.damage_notes ?? undefined,
        p_damage_cost: inspection.damage_cost ?? 0,
        p_hours_used: inspection.hours_used ?? undefined,
        p_fuel_level: inspection.fuel_level ?? undefined,
        p_inspected_by: inspection.inspected_by ?? undefined,
        p_inspected_at: inspection.inspected_at ?? nowMty().toISOString(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["return_inspections"] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      toast.error("Error al completar inspección de retorno", { description: err.message });
    },
  });
}
