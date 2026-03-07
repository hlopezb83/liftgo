import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import type { Tables } from "@/integrations/supabase/types";

export type ActivityEntry = Tables<"activity_feed">;

export function useActivityFeed(limit = 50, entityType?: string) {
  return useQuery({
    queryKey: ["activity_feed", limit, entityType],
    queryFn: async () => {
      let query = supabase
        .from("activity_feed")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (entityType) query = query.eq("entity_type", entityType);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
