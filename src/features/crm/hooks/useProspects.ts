import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapProspectRow } from "../lib/prospectMapper";
import type { Prospect, ProspectRow } from "../lib/prospectTypes";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

export type { Prospect, ProspectRow } from "../lib/prospectTypes";

export type ProspectInsert = Omit<
  ProspectRow,
  "id" | "created_at" | "updated_at" | "created_by" | "closed_at" | "lost_reason" | "final_amount"
> & {
  closed_at?: string | null;
  lost_reason?: string | null;
  final_amount?: number | null;
};
export type ProspectUpdate = Partial<ProspectInsert> & { id: string };

export const prospectQueries = defineEntityQueries<"prospects", Prospect[], never>("prospects", {
  list: () => async () => {
    const { data, error } = await supabase
      .from("prospects")
      .select("*")
      .order("stage_order", { ascending: true });
    if (error) throw error;
    const rows: ProspectRow[] = data ?? [];

    const creatorIds = rows.map((r) => r.created_by).filter((id): id is string => Boolean(id));
    const uniqueCreatorIds = [...new Set(creatorIds)];
    const profileMap = new Map<string, string | null>();
    if (uniqueCreatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", uniqueCreatorIds);
      (profiles ?? []).forEach((p) => profileMap.set(p.user_id, p.full_name));
    }

    return rows.map((r) =>
      mapProspectRow(r, { creatorName: r.created_by ? profileMap.get(r.created_by) ?? null : null }),
    );
  },
});

export function useProspects() {
  return useQuery(prospectQueries.list());
}

export {
  useCreateProspect,
  useUpdateProspect,
  useDeleteProspect,
} from "./useProspectMutations";
