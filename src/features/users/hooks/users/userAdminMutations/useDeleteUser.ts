import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { userKeys } from "../../../lib/queryKeys";

export function useDeleteUser() {
  return useEntityMutation({
    mutationFn: async (userId: string) => {
      // R14-K: extraer el body real (ej. LAST_ADMIN_CANNOT_BE_DELETED).
      return await invokeEdgeFunction("delete-user", { body: { user_id: userId } });
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Usuario eliminado",
    errorTitle: "No se pudo eliminar usuario",
  });
}
