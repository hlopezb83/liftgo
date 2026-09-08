import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { deleteUserFn } from "@/lib/userAdmin.functions";
import { userKeys } from "../../../lib/queryKeys";

export function useDeleteUser() {
  return useEntityMutation({
    mutationFn: async (userId: string) => {
      // El mensaje real (ej. LAST_ADMIN_CANNOT_BE_DELETED) llega en error.message.
      return await deleteUserFn({ data: { user_id: userId } });
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Usuario eliminado",
    errorTitle: "No se pudo eliminar usuario",
  });
}
