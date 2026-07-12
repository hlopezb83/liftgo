import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { userKeys } from "../../../lib/queryKeys";

export function useInviteUser() {
  return useEntityMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string; password?: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; user_id: string; email: string };
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Usuario creado exitosamente",
    errorTitle: "Error al crear usuario",
  });
}
