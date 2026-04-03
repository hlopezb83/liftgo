import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { AppRole } from "./useUserRole";

export type AccessLevel = "full" | "read" | "none";
export type PermissionsMap = Record<string, Record<string, AccessLevel>>;

export const MODULES = [
  "Dashboard", "Flota", "Reservas", "Calendario", "Entregas",
  "Facturas", "Pagos", "Contratos", "Cotizaciones", "Clientes",
  "CRM / Prospectos", "Mantenimiento", "Daños", "Refacciones",
  "Gastos", "Proveedores", "Reportes", "Configuración", "Gestión de Usuarios",
] as const;

/** Map sidebar route → module name */
export const ROUTE_TO_MODULE: Record<string, string> = {
  "/": "Dashboard",
  "/fleet": "Flota",
  "/bookings": "Reservas",
  "/calendar": "Calendario",
  "/deliveries": "Entregas",
  "/invoices": "Facturas",
  "/contracts": "Contratos",
  "/quotes": "Cotizaciones",
  "/customers": "Clientes",
  "/crm": "CRM / Prospectos",
  "/maintenance": "Mantenimiento",
  "/damage": "Daños",
  "/inventory": "Refacciones",
  "/expenses": "Gastos",
  "/suppliers": "Proveedores",
  "/reports": "Reportes",
  "/settings/operations": "Configuración",
  "/settings/company": "Configuración",
  "/users": "Gestión de Usuarios",
  "/returns": "Entregas",
  "/income-statement": "Reportes",
};

export function useRolePermissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["role_permissions"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, module, access_level");
      if (error) throw error;

      const map: PermissionsMap = {};
      for (const row of data ?? []) {
        const role = row.role as string;
        if (!map[role]) map[role] = {};
        map[role][row.module] = row.access_level as AccessLevel;
      }
      return map;
    },
  });
}

export function useUpdatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ role, module, access_level }: { role: AppRole; module: string; access_level: AccessLevel }) => {
      const { error } = await supabase
        .from("role_permissions")
        .update({ access_level, updated_at: nowMty().toISOString() })
        .eq("role", role)
        .eq("module", module);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role_permissions"] });
    },
  });
}

/** Helper: get access level for a role+module from the permissions map */
export function getAccessLevel(perms: PermissionsMap | undefined, role: AppRole | undefined, module: string): AccessLevel {
  if (!perms || !role) return "none";
  return perms[role]?.[module] ?? "none";
}
