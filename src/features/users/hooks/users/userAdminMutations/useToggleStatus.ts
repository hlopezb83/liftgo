import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { USERS_QUERY_KEY } from "../useUsersQuery";

export function useToggleStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { data, error } = await supabase.functions.invoke("toggle-user-status", { body: { user_id: userId, is_active: isActive } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success(vars.isActive ? "Usuario activado" : "Usuario desactivado");
    },
    onError: (err: Error) => toast.error("Error al cambiar estado", { description: err.message }),
  });
}
