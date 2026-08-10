import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { userKeys } from "../../../lib/queryKeys";

export function useInviteUser() {
  return useEntityMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string; password?: string }) => {
      // R14-K: invokeEdgeFunction extrae el body real de errores no-2xx
      // (ej. 409 "Ya existe un usuario con ese correo").
      return await invokeEdgeFunction<{ success: boolean; user_id: string; email: string; recovery_link: string | null }>(
        "invite-user",
        { body: payload },
      );
    },
    invalidateKeys: [userKeys.all],
    errorTitle: "Error al crear usuario",
    // FIX-R2-02 (N8): la edge devuelve un recovery_link de un solo uso para que el
    // invitado defina su contraseña; antes se descartaba y el usuario creado no
    // tenía forma de entrar. Mismo patrón que useResetPassword: toast con el link.
    // `successMsg` se omite a propósito para no duplicar el toast de éxito.
    onSuccess: (data) => {
      if (data.recovery_link) {
        const link = data.recovery_link;
        notifySuccess("Usuario creado", {
          description: `Comparte este enlace de un solo uso con ${data.email}: ${link}`,
          durationMs: 15_000,
          action: {
            label: "Copiar enlace",
            onClick: () => {
              void navigator.clipboard.writeText(link).catch(() => undefined);
            },
          },
        });
      } else {
        // La edge no logró generar el link (no bloquea la invitación): orientar al
        // admin para que use "Restablecer contraseña" desde la lista de usuarios.
        notifySuccess("Usuario creado", {
          description:
            "No se generó el enlace de acceso. Usa “Restablecer contraseña” en la lista de usuarios para enviárselo.",
        });
      }
    },
  });
}
