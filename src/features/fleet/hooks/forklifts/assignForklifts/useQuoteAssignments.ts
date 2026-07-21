import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { quoteAssignedForkliftKeys } from "../../../lib/queryKeys";

const sel = (s: string): string => s;

const QUOTE_ASSIGNED_FORKLIFT_COLUMNS = sel("id, quote_id, forklift_id, line_index, created_at");

type QuoteAssignedForklift = Tables<"quote_assigned_forklifts">;

export const quoteAssignmentsQueries = defineEntityQueries<
  typeof quoteAssignedForkliftKeys.all[number],
  QuoteAssignedForklift[],
  never
>("quote_assigned_forklifts", {
  list: (filter) => async () => {
    const quoteId = filter?.quoteId as string | undefined;
    const { data, error } = await supabase
      .from("quote_assigned_forklifts")
      .select(QUOTE_ASSIGNED_FORKLIFT_COLUMNS)
      .eq("quote_id", quoteId ?? "")
      .order("line_index")
      .returns<QuoteAssignedForklift[]>();
    if (error) throw error;
    return data ?? [];
  },
});

export function useQuoteAssignments(quoteId: string | undefined) {
  return useQuery({
    ...quoteAssignmentsQueries.list({ quoteId }),
    enabled: !!quoteId,
  });
}
