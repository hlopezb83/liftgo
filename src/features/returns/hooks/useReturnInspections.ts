import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowMty } from "@/lib/utils";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

const SELECT_WITH_JOINS =
  "*, bookings(customer_name, start_date, end_date), forklifts(name, model)";

export const returnInspectionKeys = createEntityKeys("return_inspections");

export function useReturnInspection(id?: string) {
  return useQuery({
    queryKey: id ? returnInspectionKeys.detail(id) : returnInspectionKeys.details(),
    enabled: !!id,
    queryFn: async (): Promise<ReturnInspectionWithJoins> => {
      const { data, error } = await supabase
        .from("return_inspections")
        .select(SELECT_WITH_JOINS)
        .eq("id", id ?? "")
        .single()
        .returns<ReturnInspectionWithJoins>();
      if (error) throw error;
      return data;
    },
  });
}

export function useReturnInspections(forkliftId?: string) {
  return useQuery({
    queryKey: returnInspectionKeys.byFilter({ forkliftId: forkliftId ?? null }),
    staleTime: 60_000,
    queryFn: async (): Promise<ReturnInspectionWithJoins[]> => {
      let query = supabase
        .from("return_inspections")
        .select(SELECT_WITH_JOINS)
        .order("inspected_at", { ascending: false });
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query.returns<ReturnInspectionWithJoins[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateReturnInspection() {
  return useEntityMutation({
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
    invalidateKeys: [
      returnInspectionKeys.all,
      ["bookings"],
      ["forklifts"],
      ["status_logs"],
    ],
    errorTitle: "Error al completar inspección de retorno",
  });
}
