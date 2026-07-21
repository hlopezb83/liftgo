import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { mechanicKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

const MECHANIC_COLUMNS = sel("id, name, phone, email, specialization, is_active, notes, created_at, updated_at");

export type Mechanic = Tables<"mechanics">;

type MechanicInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  specialization?: string | null;
  is_active?: boolean;
  notes?: string | null;
};

export const mechanicQueries = defineEntityQueries<"mechanics", Mechanic[], never>("mechanics", {
  staleTime: 5 * 60_000,
  list: (filter) => async () => {
    const base = supabase.from("mechanics").select(MECHANIC_COLUMNS);
    const filtered = filter?.active === true ? base.eq("is_active", true) : base;
    const { data, error } = await filtered.order("name").returns<Mechanic[]>();
    if (error) throw error;
    return data;
  },
});

export function useMechanics() {
  return useQuery(mechanicQueries.list());
}

export function useActiveMechanics() {
  return useQuery(mechanicQueries.list({ active: true }));
}

export function useCreateMechanic() {
  return useEntityMutation({
    mutationFn: async (input: MechanicInput) => {
      const { data, error } = await supabase.from("mechanics").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [mechanicKeys.all],
    errorTitle: "Error al crear mecánico",
  });
}

export function useUpdateMechanic() {
  return useEntityMutation({
    mutationFn: async ({ id, ...input }: MechanicInput & { id: string }) => {
      const { data, error } = await supabase.from("mechanics").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [mechanicKeys.all],
    errorTitle: "Error al actualizar mecánico",
  });
}

export function useDeleteMechanic() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mechanics").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [mechanicKeys.all],
    errorTitle: "Error al eliminar mecánico",
  });
}
