import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityFilters {
  from?: Date;
  to?: Date;
  actorId?: string;
  entityType?: string;
  eventType?: string;
  search?: string;
}

export function useActivityFeed(limit = 50, filters: ActivityFilters = {}) {
  return useQuery({
    queryKey: ["activity_feed", limit, filters],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("activity_feed")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)
        .or("is_e2e.is.null,is_e2e.eq.false");


      if (filters.from) query = query.gte("created_at", filters.from.toISOString());
      if (filters.to) query = query.lte("created_at", filters.to.toISOString());
      if (filters.actorId) {
        query = filters.actorId === "system"
          ? query.is("actor_id", null)
          : query.eq("actor_id", filters.actorId);
      }
      if (filters.entityType) query = query.eq("entity_type", filters.entityType);
      if (filters.eventType) query = query.eq("event_type", filters.eventType);
      if (filters.search) query = query.ilike("description", `%${filters.search}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}
