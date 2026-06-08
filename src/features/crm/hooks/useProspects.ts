import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapProspectRow } from "@/features/crm/lib/prospectMapper";
import type { Prospect, ProspectRow } from "@/features/crm/lib/prospectTypes";

export type { Prospect, ProspectRow } from "@/features/crm/lib/prospectTypes";

export type ProspectInsert = Omit<
  ProspectRow,
  "id" | "created_at" | "updated_at" | "created_by" | "closed_at" | "lost_reason" | "final_amount"
> & {
  closed_at?: string | null;
  lost_reason?: string | null;
  final_amount?: number | null;
};
export type ProspectUpdate = Partial<ProspectInsert> & { id: string };

const QUERY_KEY = ["prospects"];

export function useProspects() {
  return useQuery<Prospect[]>({
    queryKey: QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prospects")
        .select("*")
        .order("stage_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ProspectRow[];

      const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
      const profileMap = new Map<string, string | null>();
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds);
        (profiles ?? []).forEach((p) => profileMap.set(p.user_id, p.full_name));
      }

      return rows.map((r) =>
        mapProspectRow(r, { creatorName: r.created_by ? profileMap.get(r.created_by) ?? null : null }),
      );
    },
  });
}

export {
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
} from "./useProspectMutations";
