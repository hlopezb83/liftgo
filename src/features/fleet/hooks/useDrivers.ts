import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { driverKeys } from "../lib/queryKeys";

const sel = (s: string): string => s;

const DRIVER_COLUMNS = sel("id, name, phone, email, license_number, is_active, notes, created_at, updated_at");

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
    const base = supabase.from("drivers").select(DRIVER_COLUMNS);
    const filtered = filter?.active === true ? base.eq("is_active", true) : base;
    const { data, error } = await filtered.order("name").returns<Driver[]>();
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
