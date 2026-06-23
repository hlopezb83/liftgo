import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";

import { USERS_QUERY_KEY } from "../useUsersQuery";

export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string; password?: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; user_id: string; email: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      notifySuccess("Usuario creado exitosamente");
    },
    onError: (err: Error) => notifyError({ title: "Error al crear usuario", error: err }),
  });
}
