import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppRole } from "@/features/users/hooks/useUserRole";
import { PasswordValidationError } from "@/features/users/lib/PasswordValidationError";
import { USERS_QUERY_KEY } from "./useUsersQuery";

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success("Rol actualizado");
    },
    onError: (err: Error) => toast.error("Error al actualizar rol", { description: err.message }),
  });
}

export function useUpdateName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, fullName }: { userId: string; fullName: string }) => {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success("Nombre actualizado");
    },
    onError: (err: Error) => toast.error("Error al actualizar nombre", { description: err.message }),
  });
}

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

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onError: (err: Error) => toast.error("Error al eliminar usuario", { description: err.message }),
  });
}

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
      toast.success("Contraseña actualizada", {
        description: `Comparte la nueva contraseña con ${data.email}`,
      });
    },
    onError: (err: Error) => {
      if (err instanceof PasswordValidationError) return;
      toast.error("Error al actualizar contraseña", { description: err.message });
    },
  });
}

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
