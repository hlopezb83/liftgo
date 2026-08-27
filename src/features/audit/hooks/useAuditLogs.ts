import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { auditKeys, auditLogsQueries, type AuditLogFilters } from "../lib/queryKeys";

export type { AuditLog, AuditLogFilters, AuditOrigin, AuditSource } from "../lib/queryKeys";

export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery(auditLogsQueries.list(filters ?? {}));
}

/**
 * v7.364.0: purga (solo admin) los registros de la bitácora marcados como
 * generados por pruebas automatizadas. La RPC valida el rol en el servidor.
 */
export function usePurgeE2eAuditLogs() {
  return useEntityMutation<void, number>({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("purge_e2e_audit_logs");
      if (error) throw error;
      return data ?? 0;
    },
    invalidateKeys: [auditKeys.all],
    successMsg: "Registros de prueba eliminados de la bitácora",
    errorTitle: "Error al limpiar los registros de prueba",
  });
}



export function useRevertAuditLog() {
  return useEntityMutation<{ id: string; tableName: string }, string>({
    mutationFn: async ({ id, tableName }) => {
      const { error } = await supabase.rpc("revert_audit_log", { p_audit_log_id: id });
      if (error) throw error;
      return tableName;
    },
    invalidateKeys: [auditKeys.all],
    invalidateKeysFn: (tableName) => [[tableName]],
    successMsg: "Acción revertida y registro eliminado correctamente",
    errorTitle: "Error al revertir la acción",
  });
}
