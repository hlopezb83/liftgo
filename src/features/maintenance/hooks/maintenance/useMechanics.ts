import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { mechanicKeys } from "../../lib/queryKeys";

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

export function useMechanics() {
  return useQuery({
    queryKey: mechanicKeys.all,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mechanics")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useActiveMechanics() {
  return useQuery({
    queryKey: [...mechanicKeys.all, "active"] as const,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mechanics")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
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
