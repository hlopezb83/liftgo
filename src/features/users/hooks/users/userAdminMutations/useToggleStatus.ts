import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { userKeys } from "../../../lib/queryKeys";

export function useToggleStatus() {
  return useEntityMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { data, error } = await supabase.functions.invoke("toggle-user-status", { body: { user_id: userId, is_active: isActive } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    invalidateKeys: [userKeys.all],
    errorTitle: "Error al cambiar estado",
    onSuccess: (_data, vars) => {
      notifySuccess(vars.isActive ? "Usuario activado" : "Usuario desactivado");
    },
  });
}
