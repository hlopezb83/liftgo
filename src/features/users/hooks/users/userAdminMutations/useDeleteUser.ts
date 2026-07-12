import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { userKeys } from "../../../lib/queryKeys";

export function useDeleteUser() {
  return useEntityMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    invalidateKeys: [userKeys.all],
    successMsg: "Usuario eliminado",
    errorTitle: "No se pudo eliminar usuario",
  });
}
