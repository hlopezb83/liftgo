import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { mechanicKeys } from "../../lib/queryKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

import type { Tables } from "@/integrations/supabase/types";

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
    let q = supabase.from("mechanics").select("*").order("name");
    if (filter?.active === true) q = q.eq("is_active", true);
    const { data, error } = await q;
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
