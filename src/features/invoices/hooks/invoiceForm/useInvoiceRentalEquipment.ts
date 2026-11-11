import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { forkliftKeys } from "@/features/fleet";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";

export type InvoiceRentalEquipment = Pick<Tables<"forklifts">, "id" | "name" | "model" | "manufacturer"
  | "serial_number" | "equipment_model_id" | "daily_rate" | "weekly_rate" | "monthly_rate">;

const BATCH_SIZE = 50;
const EMPTY_EQUIPMENT: InvoiceRentalEquipment[] = [];
const missingEquipment = "No se pudieron verificar todos los equipos de las reservas. Reintenta la consulta antes de generar las partidas.";

export function requireInvoiceEquipment(ids: readonly string[], rows: readonly InvoiceRentalEquipment[]) {
  const loaded = new Set(rows.map((row) => row.id));
  if (ids.some((id) => !loaded.has(id))) throw new Error(missingEquipment);
}

async function readInvoiceEquipment(ids: string[], organizationId: string, visibility: string, signal: AbortSignal) {
  const rows: InvoiceRentalEquipment[] = [];
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    signal.throwIfAborted();
    const batch = ids.slice(index, index + BATCH_SIZE);
    // A valid historical booking can still reference an archived unit.
    const { data, error } = await supabase.from("forklifts")
      .select("id,name,model,manufacturer,serial_number,equipment_model_id,daily_rate,weekly_rate,monthly_rate")
      .eq("organization_id", organizationId).or(visibility).in("id", batch).abortSignal(signal);
    signal.throwIfAborted();
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export function useInvoiceRentalEquipment(ids: readonly string[]) {
  const organizationId = useVerifiedOrganizationId();
  const identity = useVerifiedIdentityScope();
  const visibility = e2eVisibilityFilter();
  const client = useQueryClient();
  const options = (requested: readonly string[]) => {
    const selected = [...new Set(requested)].sort();
    return {
      queryKey: forkliftKeys.list({ purpose: "invoice-equipment", identity, visibility, ids: selected }),
      enabled: !!organizationId && !!identity && selected.length > 0,
      staleTime: 60_000,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        if (!organizationId || !identity) throw new Error("Empresa no verificada");
        return readInvoiceEquipment(selected, organizationId, visibility, signal);
      },
    };
  };
  const result = useQuery(options(ids));
  return {
    ...result,
    data: ids.length ? result.data : EMPTY_EQUIPMENT,
    loadForIds: async (requested: readonly string[]) => {
      if (!requested.length) return EMPTY_EQUIPMENT;
      const query = options(requested);
      const rows = await client.fetchQuery(query);
      try {
        requireInvoiceEquipment(requested, rows);
      } catch (error) {
        // Missing rows can become available after a permissions/data correction.
        await client.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: "none" });
        throw error;
      }
      return rows;
    },
  };
}
