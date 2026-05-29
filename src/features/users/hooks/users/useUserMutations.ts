import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppRole } from "@/features/users/hooks/useUserRole";
import { USERS_QUERY_KEY } from "./useUsersQuery";

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase
        .from("user_roles")
        .update({ role })
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No se actualizó ningún registro. Verifica tus permisos.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success("Rol actualizado");
    },
    onError: (err: Error) => notifyError({ title: "Error al actualizar rol", error: err }),
  });
}

export function useUpdateName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", userId)
        .select("user_id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("No se actualizó ningún registro. Verifica tus permisos.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success("Nombre actualizado");
    },
    onError: (err: Error) => notifyError({ title: "Error al actualizar nombre", error: err }),
  });
}
