import { useMutation } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { resetUserPasswordFn } from "@/lib/userAdmin.functions";

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return await resetUserPasswordFn({ data: { user_id: userId } });
    },
    // El enlace es de un solo uso y la sesión del usuario ya fue revocada:
    // el toast debe durar lo suficiente y ofrecer copiado (mismo patrón que
    // useInviteUser). El diálogo además lo muestra de forma persistente.
    onSuccess: (data) => {
      const link = data.recovery_link;
      notifySuccess("Enlace de recuperación generado", {
        description: `Comparte este enlace de un solo uso con ${data.email}: ${link}`,
        durationMs: 15_000,
        action: {
          label: "Copiar enlace",
          onClick: () => {
            void navigator.clipboard.writeText(link).catch(() => undefined);
          },
        },
      });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al generar enlace de recuperación", error: err });
    },
  });
}
