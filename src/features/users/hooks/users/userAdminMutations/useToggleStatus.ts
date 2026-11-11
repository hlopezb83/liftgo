import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { toggleUserStatusFn } from "@/lib/userAdmin.functions";
import { userKeys } from "../../../lib/queryKeys";

type ToggleStatusInput = { userId: string; isActive: boolean; expectedVersion?: string };
type ToggleStatusResult = Awaited<ReturnType<typeof toggleUserStatusFn>>;

export function useToggleStatus() {
  const mutation = useEntityMutation<ToggleStatusInput, ToggleStatusResult>({
    mutationFn: ({ userId, isActive, expectedVersion }) => toggleUserStatusFn({
      data: { user_id: userId, is_active: isActive, expected_version: expectedVersion },
    }),
    invalidateKeys: [userKeys.all],
    errorTitle: "Error al cambiar estado",
    onSuccess: (data, vars) => {
      switch (data.status) {
        case "synchronized":
          notifySuccess(data.is_active ? "Usuario activado" : "Usuario desactivado");
          return;
        case "superseded":
          notifyWarning("El estado del usuario cambió durante la actualización. Revisa el estado actual.");
          return;
        case "profile_state_unconfirmed":
          notifyWarning("No se pudo confirmar el estado de la cuenta. Revisa el estado actual.");
          return;
        default:
          notifyWarning({
            title: data.status === "session_revocation_pending"
              ? "Usuario desactivado. Queda pendiente cerrar sus sesiones."
              : "La sincronización de la cuenta está pendiente.",
            action: {
              label: "Reintentar",
              onClick: () => mutation.mutate({
                userId: vars.userId,
                isActive: data.status === "auth_sync_pending" ? data.desired_is_active : false,
                expectedVersion: data.profile.updated_at,
              }),
            },
          }, { dedupeKey: `user-status-sync:${vars.userId}` });
      }
    },
  });
  return mutation;
}
