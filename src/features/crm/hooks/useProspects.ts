import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  closed_at: string | null;
  lost_reason: string | null;
  final_amount: number | null;
}

export type ProspectInsert = Omit<Prospect, "id" | "created_at" | "updated_at" | "created_by" | "created_by_name" | "closed_at" | "lost_reason" | "final_amount"> & {
  closed_at?: string | null;
  lost_reason?: string | null;
  final_amount?: number | null;
};
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
      const prospects = (data ?? []) as unknown[] as Prospect[];

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

export {
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
} from "./useProspectMutations";
