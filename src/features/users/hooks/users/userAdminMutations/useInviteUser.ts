import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { userKeys } from "../../../lib/queryKeys";

export function useInviteUser() {
  return useEntityMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string; password?: string }) => {
      // R14-K: invokeEdgeFunction extrae el body real de errores no-2xx
      // (ej. 409 "Ya existe un usuario con ese correo").
      return await invokeEdgeFunction<{ success: boolean; user_id: string; email: string }>(
        "invite-user",
        { body: payload },
      );
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Usuario creado exitosamente",
    errorTitle: "Error al crear usuario",
  });
}
