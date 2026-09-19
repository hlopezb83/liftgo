/**
 * Mutaciones de clientes (sin lecturas de cartera).
 *
 * Extraído de `useCustomers.ts` (Paquete 7) sin cambios de comportamiento:
 * mismos payloads, bloqueo optimista con `expectedVersion`/`stale_write`,
 * `assertRowsAffected`, RPC `soft_delete_customer`, invalidaciones y títulos
 * de error. El navegador nunca envía `organization_id`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import type { BusinessBlock } from "@/lib/rules/businessBlocks";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { customerKeys } from "../../lib/queryKeys";

export function useCreateCustomer() {
  return useEntityMutation({
    mutationFn: async (customer: TablesInsert<"customers">) => {
      const { data, error } = await supabase.from("customers").insert(customer).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al crear cliente",
  });
}

/**
 * M-11a: bloqueo optimista. El llamador envía `expectedVersion` — el valor de
 * `version` que tenía el registro CUANDO se abrió el formulario. Si otro
 * usuario guardó en el intermedio, el trigger `bump_version_optimistic` ya
 * incrementó la columna, el UPDATE afecta 0 filas y abortamos en vez de pisar
 * los cambios ajenos (lost update). Sin `expectedVersion` se conserva el
 * comportamiento anterior (sin bloqueo) para no romper flujos internos.
 */
export function useUpdateCustomer() {
  return useEntityMutation({
    mutationFn: async ({ id, expectedVersion, ...updates }: TablesUpdate<"customers"> & {
      id: string;
      expectedVersion?: number | null;
    }) => {
      // R10 Bloque 12.7: no actualizar clientes archivados.
      let q = supabase.from("customers").update(updates).eq("id", id).is("deleted_at", null);
      if (expectedVersion != null) q = q.eq("version", expectedVersion);
      const { data, error } = await q.select();

      if (error) throw error;
      if ((!data || data.length === 0) && expectedVersion != null) {
        // Distinguir conflicto de concurrencia de "sin permisos / archivado".
        const { data: still } = await supabase
          .from("customers").select("version").eq("id", id).is("deleted_at", null).maybeSingle();
        // FIX R6-11: conflicto real solo si la versión cambió; si coincide, el
        // UPDATE falló por RLS/permisos y no hay que reportar un falso
        // stale_write (patrón R5-17 de facturas).
        if (still && still.version !== expectedVersion) {
          throw new Error("stale_write: otro usuario modificó este cliente; recarga y vuelve a intentar");
        }
      }
      // GUI-FE-08: 0 filas = sin permisos (RLS) o registro archivado/inexistente.
      assertRowsAffected(data, "Actualizar cliente");
      return data[0];
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al actualizar cliente",
  });
}

export function useDeleteCustomer(opts?: {
  /** Bloqueos de negocio del backend (saldo pendiente, rentas activas). */
  onBusinessBlock?: (block: BusinessBlock) => void;
}) {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      // Soft delete: preserva historial de facturas y bookings
      const { error } = await supabase.rpc("soft_delete_customer", { p_customer_id: id });
      if (error) throw error;
    },
    invalidateKeys: [customerKeys.all],
    errorTitle: "Error al archivar cliente",
    ...(opts?.onBusinessBlock
      ? { onBusinessBlock: (block: BusinessBlock) => opts.onBusinessBlock?.(block) }
      : {}),
  });
}
