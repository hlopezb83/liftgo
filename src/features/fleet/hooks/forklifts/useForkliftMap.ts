import type { Tables } from "@/integrations/supabase/types";
import { useForklifts } from "./useForklifts";

/**
 * Returns a Map of forklift ID → forklift object.
 * React Compiler memoiza automáticamente.
 */
export function useForkliftMap() {
  const { data: forklifts, isLoading, isError, isFetching, refetch } = useForklifts();
  const forkliftMap = new Map<string, Tables<"forklifts">>(
    forklifts?.map((f) => [f.id, f]) || [],
  );
  return { forkliftMap, forklifts, isLoading, isError, isFetching, refetch };
}
