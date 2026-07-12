import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { PasswordValidationError } from "../../../lib/PasswordValidationError";

/**
 * No usa `useEntityMutation` porque necesita suprimir el toast global de error
 * cuando la falla es una `PasswordValidationError` (se muestra inline en el
 * formulario), comportamiento que `useEntityMutation` no permite personalizar.
 */
export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { user_id: userId, new_password: newPassword },
      });
      if (error) throw error;
      if (data?.success === false && typeof data.error === "string") {
        const code = data.code === "pwned" ? "pwned" : "weak_password";
        const raw = typeof data.raw === "string" ? data.raw : undefined;
        throw new PasswordValidationError(data.error, code, raw);
      }
      if (data?.error) throw new Error(data.error);
      return data as { email: string };
    },
    onSuccess: (data) => {
      notifySuccess("Contraseña actualizada", {
        description: `Comparte la nueva contraseña con ${data.email}`,
      });
    },
    onError: (err: Error) => {
      if (err instanceof PasswordValidationError) return;
      notifyError({ title: "Error al actualizar contraseña", error: err });
    },
  });
}
