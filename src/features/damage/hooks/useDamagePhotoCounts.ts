import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a map of damage_record id -> photo count, derived from the
 * documents table (entity_type = 'damage_record', mime_type image/*).
 */
export function useDamagePhotoCounts() {
  return useQuery({
    queryKey: ["damage_photo_counts"],
    queryFn: async () => {
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
}
