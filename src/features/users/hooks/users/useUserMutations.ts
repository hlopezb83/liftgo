import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";

import type { AppRole } from "../useUserRole";
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
      assertRowsAffected(data, "Actualizar rol");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      notifySuccess("Rol actualizado");
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
      assertRowsAffected(data, "Actualizar nombre");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      notifySuccess("Nombre actualizado");
    },
    onError: (err: Error) => notifyError({ title: "Error al actualizar nombre", error: err }),
  });
}
