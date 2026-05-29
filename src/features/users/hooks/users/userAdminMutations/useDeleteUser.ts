import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";
import { USERS_QUERY_KEY } from "../useUsersQuery";

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", { body: { user_id: userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success("Usuario eliminado");
    },
    onError: (err: Error) =>
      notifyError({ error: err, title: "No se pudo eliminar usuario", method: "delete-user" }),
  });
}
