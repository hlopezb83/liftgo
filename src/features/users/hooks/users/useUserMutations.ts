import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { userKeys } from "../../lib/queryKeys";
import type { AppRole } from "../useUserRole";

export function useUpdateRole() {
  return useEntityMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar rol");
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
