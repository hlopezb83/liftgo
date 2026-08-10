import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeErrorMessage } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { user_id: userId },
      });
      if (error) throw new Error(await extractEdgeErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      return data as { email: string; recovery_link: string };
    },
    onSuccess: (data) => {
      notifySuccess("Enlace de recuperación generado", {
        description: `Comparte este enlace de un solo uso con ${data.email}: ${data.recovery_link}`,
      });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al generar enlace de recuperación", error: err });
    },
  });
}
