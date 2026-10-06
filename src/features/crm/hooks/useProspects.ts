import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { mapProspectRow } from "../lib/prospectMapper";
import type { Prospect, ProspectRow } from "../lib/prospectTypes";

export type { Prospect } from "../lib/prospectTypes";

export type ProspectInsert = Omit<
  ProspectRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "closed_at"
  | "lost_reason"
  | "final_amount"
  | "organization_id"
> & {
  closed_at?: string | null;
  lost_reason?: string | null;
  final_amount?: number | null;
};
// Multi-organización (tramo 4): `organization_id` no es un campo del payload.
// Lo asigna el trigger `enforce_organization_write_context` con la membresía
// verificada del usuario; el navegador no puede proponer otra empresa.
export type ProspectUpdate = Partial<ProspectInsert> & { id: string };

// Lote F · columnas explícitas: solo lo que consume mapProspectRow.
const PROSPECT_COLUMNS =
  "id, company_name, contact_person, email, phone, deal_value, stage, stage_order, notes, quote_id, customer_id, created_by, created_at, updated_at, closed_at, lost_reason, final_amount" as const;
const PROSPECT_PAGE_SIZE = 500;

const prospectQueries = defineEntityQueries<"prospects", Prospect[], never>("prospects", {
  list: () => async () => {
    const rows: ProspectRow[] = [];
    for (let offset = 0; ; offset += PROSPECT_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("prospects")
        .select(PROSPECT_COLUMNS)
        .order("stage_order", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PROSPECT_PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as ProspectRow[];
      rows.push(...page);
      if (page.length < PROSPECT_PAGE_SIZE) break;
    }

    const creatorIds = rows.map((r) => r.created_by).filter((id): id is string => Boolean(id));
    const uniqueCreatorIds = [...new Set(creatorIds)];
    const profileMap = new Map<string, string | null>();
    for (let offset = 0; offset < uniqueCreatorIds.length; offset += 100) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", uniqueCreatorIds.slice(offset, offset + 100));
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
  useMoveProspectStage,
} from "./useProspectMutations";
