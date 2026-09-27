import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import type { ReturnInspectionWithJoins } from "@/types/rental";

const SELECT_WITH_JOINS =
  "*, bookings(customer_name, start_date, end_date), forklifts(name, model)";

async function fetchList(forkliftId?: string) {
  let query = supabase
    .from("return_inspections")
    .select(SELECT_WITH_JOINS)
    .order("inspected_at", { ascending: false })
    .limit(LIST_FETCH_LIMIT);
  if (forkliftId) query = query.eq("forklift_id", forkliftId);
  const { data, error } = await query.returns<ReturnInspectionWithJoins[]>();
  if (error) throw error;
  return data ?? [];
}

async function fetchDetail(id: string) {
  const { data, error } = await supabase
    .from("return_inspections")
    .select(SELECT_WITH_JOINS)
    .eq("id", id)
    .single()
    .returns<ReturnInspectionWithJoins>();
  if (error) throw error;
  return data;
}

export const returnInspectionQueries = defineEntityQueries<
  "return_inspections",
  ReturnInspectionWithJoins[],
  ReturnInspectionWithJoins
>("return_inspections", {
  list: (filter) => {
    const forkliftId = filter?.forkliftId as string | undefined;
    return () => fetchList(forkliftId);
  },
  detail: (id) => () => fetchDetail(id),
});

export const returnInspectionKeys = returnInspectionQueries.keys;

export function useReturnInspection(id?: string) {
  return useQuery({
    ...returnInspectionQueries.detail(id ?? ""),
    enabled: !!id,
  });
}

export function useReturnInspections(forkliftId?: string) {
  return useQuery(returnInspectionQueries.list({ forkliftId: forkliftId ?? null }));
}

export function useCreateReturnInspection() {
  return useEntityMutation({
    // Multi-organización: organization_id lo resuelve la base, el cliente no lo envía.
    mutationFn: async (inspection: Omit<TablesInsert<"return_inspections">, "inspection_number" | "organization_id">) => {
      // El overload desplegado exige p_forklift_id (uuid, 2º arg, sin default).
      // supabase-js descarta claves undefined, lo que reduce la aridad y hace
      // que Postgres no resuelva ningún overload. Pasamos null explícito para
      // los campos opcionales y exigimos forklift_id arriba (en el diálogo).
      const { data, error } = await supabase.rpc("complete_return_inspection", {
        p_booking_id: inspection.booking_id,
        p_forklift_id: inspection.forklift_id,
        p_condition: inspection.condition ?? "good",
        p_damage_notes: inspection.damage_notes ?? null,
        p_damage_cost: inspection.damage_cost ?? 0,
        p_hours_used: inspection.hours_used ?? null,
        p_fuel_level: inspection.fuel_level ?? null,
        p_inspected_by: inspection.inspected_by ?? null,
        // R6-FE-06: UTC real (mismo bug de doble offset que deliveries).
        p_inspected_at: inspection.inspected_at ?? new Date().toISOString(),
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
