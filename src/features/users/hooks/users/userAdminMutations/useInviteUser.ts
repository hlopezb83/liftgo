import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
      toast.success("Usuario creado exitosamente");
    },
    onError: (err: Error) => toast.error("Error al crear usuario", { description: err.message }),
  });
}
