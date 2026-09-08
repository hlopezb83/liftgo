import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { toggleUserStatusFn } from "@/lib/userAdmin.functions";
import { userKeys } from "../../../lib/queryKeys";

export function useToggleStatus() {
  return useEntityMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      await toggleUserStatusFn({ data: { user_id: userId, is_active: isActive } }),
    invalidateKeys: [userKeys.all],
    errorTitle: "Error al cambiar estado",
    onSuccess: (_data, vars) => {
      notifySuccess(vars.isActive ? "Usuario activado" : "Usuario desactivado");
    },
  });
}
