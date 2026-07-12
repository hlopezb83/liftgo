import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { damagePhotoCountsKeys } from "../lib/queryKeys";

/**
 * Returns a map of damage_record id -> photo count, derived from the
 * documents table (entity_type = 'damage_record', mime_type image/*).
 */
export const damagePhotoCountsQueries = defineEntityQueries<
  typeof damagePhotoCountsKeys.all[number],
  Record<string, number>,
  never
>("damage_photo_counts", {
  list: () => async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("entity_id")
      .eq("entity_type", "damage_record")
      .like("mime_type", "image/%");
    if (error) throw error;
    const counts: Record<string, number> = {};
    data?.forEach((d) => {
      counts[d.entity_id] = (counts[d.entity_id] || 0) + 1;
    });
    return counts;
  },
});

export function useDamagePhotoCounts() {
  return useQuery(damagePhotoCountsQueries.list());
}
