import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { driverKeys } from "../lib/queryKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

import type { Tables } from "@/integrations/supabase/types";

export type Driver = Tables<"drivers">;

type DriverInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  license_number?: string | null;
  is_active?: boolean;
  notes?: string | null;
};

export const driverQueries = defineEntityQueries<"drivers", Driver[], never>("drivers", {
  staleTime: 5 * 60_000,
  list: (filter) => async () => {
    let q = supabase.from("drivers").select("*").order("name");
    if (filter?.active === true) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
});

export function useDrivers() {
  return useQuery(driverQueries.list());
}

export function useActiveDrivers() {
  return useQuery(driverQueries.list({ active: true }));
}

export function useCreateDriver() {
  return useEntityMutation({
    mutationFn: async (input: DriverInput) => {
      const { data, error } = await supabase.from("drivers").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [driverKeys.all],
    errorTitle: "Error al crear chofer",
  });
}

export function useUpdateDriver() {
  return useEntityMutation({
    mutationFn: async ({ id, ...input }: DriverInput & { id: string }) => {
      const { data, error } = await supabase.from("drivers").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [driverKeys.all],
    errorTitle: "Error al actualizar chofer",
  });
}

export function useDeleteDriver() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [driverKeys.all],
    errorTitle: "Error al eliminar chofer",
  });
}
