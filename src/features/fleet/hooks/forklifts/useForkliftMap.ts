import { useForklifts } from "./useForklifts";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Returns a Map of forklift ID → forklift object.
 * React Compiler memoiza automáticamente.
 */
export function useForkliftMap() {
  const { data: forklifts, isLoading } = useForklifts();
  const forkliftMap = new Map<string, Tables<"forklifts">>(
    forklifts?.map((f) => [f.id, f]) || [],
  );
  return { forkliftMap, forklifts, isLoading };
}
