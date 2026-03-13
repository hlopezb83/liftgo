import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/useUserRole";

export interface UserRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string;
  role: AppRole;
  is_active: boolean;
}

const QUERY_KEY = ["users_with_roles"];

export function useUsersWithRoles() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, is_active, created_at")
        .order("created_at", { ascending: false });
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
      return (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: (p as any).email ?? null,
        created_at: p.created_at,
        role: roleMap.get(p.user_id) ?? ("dispatcher" as AppRole),
        is_active: (p as any).is_active ?? true,
      })) as UserRow[];
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").update({ role }).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Usuario eliminado");
    },
    onError: (err: Error) => toast.error("Error al eliminar usuario", { description: err.message }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("reset-user-password", { body: { user_id: userId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { email: string; password: string };
    },
    onError: (err: Error) => toast.error("Error al resetear contraseña", { description: err.message }),
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(vars.isActive ? "Usuario activado" : "Usuario desactivado");
    },
    onError: (err: Error) => toast.error("Error al cambiar estado", { description: err.message }),
  });
}
