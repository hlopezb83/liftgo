import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowMty } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { telemetry } from "@/lib/telemetry";
import type { AppRole } from "./useUserRole";

export type AccessLevel = "full" | "read" | "none";
export type PermissionsMap = Record<string, Record<string, AccessLevel>>;

export const MODULES = [
  "Dashboard", "Flota", "Reservas", "Calendario", "Entregas",
  "Facturas", "Pagos", "Contratos", "Cotizaciones", "Clientes",
  "CRM / Prospectos", "Mantenimiento", "Daños", "Refacciones",
  "Gastos", "Proveedores", "Reportes", "Configuración", "Gestión de Usuarios",
  "Feedback",
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
  "/feedback": "Feedback",
};

/**
 * Resuelve el módulo para una ruta arbitraria (ej: `/fleet/abc-123/edit`).
 * Hace match por prefijo del segmento más largo. Devuelve `null` si no aplica
 * permisos (ej: rutas internas como `/activity`, `/changelog`).
 */
export function getModuleForPath(pathname: string): string | null {
  if (ROUTE_TO_MODULE[pathname]) return ROUTE_TO_MODULE[pathname];
  // Ordenamos por longitud descendente para que "/fleet/new" gane sobre "/fleet"
  const candidates = Object.keys(ROUTE_TO_MODULE).sort((a, b) => b.length - a.length);
  for (const route of candidates) {
    if (route === "/") continue;
    if (pathname === route || pathname.startsWith(route + "/")) {
      return ROUTE_TO_MODULE[route];
    }
  }
  return null;
}
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
  const roleMap = perms[role];
  if (roleMap && !(module in roleMap)) {
    telemetry.warn("RoleGuard", `Módulo "${module}" no existe en role_permissions`, {
      validModules: Object.keys(roleMap),
    });
  }
  return roleMap?.[module] ?? "none";
}
