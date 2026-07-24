import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { userKeys } from "../../lib/queryKeys";
import type { AppRole } from "../useUserRole";

export function useUpdateRole() {
  return useEntityMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // v7.223.0 · DIFF 12 residual: la RPC blinda el invariante "no degradar
      // al último admin". Si la RPC lanza LAST_ADMIN_CANNOT_BE_DEMOTED
      // el error se propaga tal cual y notifyError lo muestra al usuario.
      const { error } = await supabase.rpc("update_user_role_safe", {
        _target_user_id: userId,
        _new_role: role,
      });
      if (error) throw error;
      // La RPC hace UPDATE ... IF NOT FOUND RAISE, así que si no hubo error
      // sabemos que exactamente 1 fila fue afectada. `assertRowsAffected`
      // ya no aplica porque no tenemos el resultset de la mutación.
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Rol actualizado",
    errorTitle: "Error al actualizar rol",
  });
}

export function useUpdateName() {
  return useEntityMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar nombre");
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Nombre actualizado",
    errorTitle: "Error al actualizar nombre",
  });
}
