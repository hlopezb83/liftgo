import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Mechanic = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  specialization: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

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
    queryKey: ["mechanics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mechanics")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Mechanic[];
    },
  });
}

export function useActiveMechanics() {
  return useQuery({
    queryKey: ["mechanics", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mechanics")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Mechanic[];
    },
  });
}

export function useCreateMechanic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MechanicInput) => {
      const { data, error } = await supabase.from("mechanics").insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mechanics"] }),
  });
}

export function useUpdateMechanic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: MechanicInput & { id: string }) => {
      const { data, error } = await supabase.from("mechanics").update(input).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mechanics"] }),
  });
}

export function useDeleteMechanic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mechanics").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mechanics"] }),
  });
}
