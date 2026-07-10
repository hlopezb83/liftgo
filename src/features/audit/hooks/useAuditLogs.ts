import { useQuery } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { supabase } from "@/integrations/supabase/client";

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
  // joined
  user_email?: string;
}

export function useAuditLogs(filters?: { table_name?: string; record_id?: string }) {
  return useQuery({
    queryKey: ["audit_logs", filters],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters?.table_name) query = query.eq("table_name", filters.table_name);
      if (filters?.record_id) query = query.eq("record_id", filters.record_id);

      // Nota: el trigger de auditoría ya descarta filas con is_e2e=true desde 2026-06-10.
      // Un filtro client-side sobre old_data->>is_e2e en PostgREST descarta también los NULL,
      // lo cual vaciaba la bitácora. Se confía en el trigger.

      const { data, error } = await query;
      if (error) throw error;

      // Batch fetch user emails for display
      const logs = (data ?? []) as unknown[] as AuditLog[];
      const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
        logs.forEach((l) => {
          if (l.user_id) l.user_email = profileMap.get(l.user_id) || "Desconocido";
        });
      }

      return logs;
    },
  });
}

export function useDeleteAuditLog() {
  return useEntityMutation<string, void>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("audit_logs").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [["audit_logs"]],
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
    invalidateKeys: [["audit_logs"]],
    invalidateKeysFn: (tableName) => [[tableName]],
    successMsg: "Acción revertida y registro eliminado correctamente",
    errorTitle: "Error al revertir la acción",
  });
}
