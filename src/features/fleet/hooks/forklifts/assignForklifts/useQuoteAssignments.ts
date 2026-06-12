import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useQuoteAssignments(quoteId: string | undefined) {
  return useQuery({
    queryKey: ["quote_assigned_forklifts", quoteId],
    enabled: !!quoteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_assigned_forklifts")
        .select("*")
        .eq("quote_id", quoteId ?? "")
        .order("line_index");
      if (error) throw error;
      return data;
    },
  });
}
