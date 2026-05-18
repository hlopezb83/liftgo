import { useMemo } from "react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Returns a memoized Map of forklift ID → forklift object.
 * Consolidates the repeated pattern across MaintenancePage, DeliveriesPage,
 * ReturnInspectionPage, and MaintenanceCostReport.
 */
export function useForkliftMap() {
  const { data: forklifts, isLoading } = useForklifts();

  const forkliftMap = useMemo(
    () => new Map<string, Tables<"forklifts">>(forklifts?.map((f) => [f.id, f]) || []),
    [forklifts]
  );

  return { forkliftMap, forklifts, isLoading };
}
