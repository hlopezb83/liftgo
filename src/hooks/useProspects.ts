import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Prospect {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  deal_value: number;
  stage: string;
  notes: string | null;
  stage_order: number;
  quote_id: string | null;
  customer_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export type ProspectInsert = Omit<Prospect, "id" | "created_at" | "updated_at" | "created_by" | "created_by_name">;
export type ProspectUpdate = Partial<ProspectInsert> & { id: string };

const QUERY_KEY = ["prospects"];

export function useProspects() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospects")
        .select("*")
        .order("stage_order", { ascending: true });
      if (error) throw error;
      const prospects = data as unknown as Prospect[];

      // Resolve creator names from profiles
      const creatorIds = [...new Set(prospects.map((p) => p.created_by).filter(Boolean))] as string[];
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds);
        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
        prospects.forEach((p) => {
          if (p.created_by) p.created_by_name = profileMap.get(p.created_by) || null;
        });
      }

      return prospects;
    },
  });
}

export function useCreateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<ProspectInsert, "stage_order" | "customer_id">) => {
      const { data: existing } = await supabase
        .from("prospects")
        .select("stage_order")
        .eq("stage", p.stage)
        .order("stage_order", { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.stage_order ?? -1) + 1;
      const { data, error } = await supabase
        .from("prospects")
        .insert({ ...p, stage_order: nextOrder })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Prospecto creado");
    },
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });
}

export function useUpdateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProspectUpdate) => {
      const { data, error } = await supabase
        .from("prospects")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prospects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Prospecto eliminado");
    },
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });
}
