import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { auditKeys, auditLogsQueries, type AuditLogFilters } from "../lib/queryKeys";

export type { AuditLog, AuditLogFilters } from "../lib/queryKeys";

export function useAuditLogs(filters?: AuditLogFilters) {
  return useQuery(auditLogsQueries.list(filters ?? {}));
}

export function useDeleteAuditLog() {
  return useEntityMutation<string, void>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("audit_logs").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [auditKeys.all],
    successMsg: "Registro eliminado correctamente",
    errorTitle: "Error al eliminar el registro",
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
