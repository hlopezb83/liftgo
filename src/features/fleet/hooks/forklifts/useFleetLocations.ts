import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

/**
 * Tanda 3 P1-5 · Consulta consolidada de ubicación + póliza activa por equipo.
 * Reemplaza los 3 hooks pesados que /fleet cargaba solo para 2 columnas:
 * `useContracts` (traía `content` completo), `useDeliveries` y
 * `useMaintenancePolicies`. La vista `forklift_current_location` deriva la
 * ubicación (contrato activo → última entrega completada) y la señal de
 * póliza en SQL con `security_invoker=true`.
 */
export interface ForkliftCurrentLocation {
  forklift_id: string;
  location: string | null;
  has_active_policy: boolean;
}

interface FleetLocationsIndex {
  locationMap: Map<string, string>;
  activePolicyForkliftIds: Set<string>;
}

export const fleetLocationsQueries = defineEntityQueries("fleet_locations", {
  list: () => async (): Promise<FleetLocationsIndex> => {
    const { data, error } = await supabase
      // La vista no está en types.ts hasta la próxima regeneración; el cast
      // convive con el resto de la lógica sin filtrar el tipo hacia afuera.
      .from("forklift_current_location" as never)
      .select("forklift_id, location, has_active_policy")
      .returns<ForkliftCurrentLocation[]>();
    if (error) throw error;
    const locationMap = new Map<string, string>();
    const activePolicyForkliftIds = new Set<string>();
    for (const row of data ?? []) {
      if (row.location) locationMap.set(row.forklift_id, row.location);
      if (row.has_active_policy) activePolicyForkliftIds.add(row.forklift_id);
    }
    return { locationMap, activePolicyForkliftIds };
  },
  staleTime: 60_000,
});

export function useFleetLocations() {
  return useQuery(fleetLocationsQueries.list());
}

// Nota: `fleetLocationsKey` se removió en v7.236.5 (Knip: sin consumidores).
// Los módulos que necesiten invalidar esta cache deben usar
// `fleetLocationsQueries.keys.all` directamente.

