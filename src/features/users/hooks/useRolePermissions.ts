import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { telemetry } from "@/lib/telemetry";
import { nowMty } from "@/lib/utils";
import type { AppRole } from "./useUserRole";

export type AccessLevel = "full" | "read" | "none";
export type PermissionsMap = Record<string, Record<string, AccessLevel>>;

export const MODULES = [
  "Dashboard", "Flota", "Reservas", "Calendario", "Entregas",
  "Facturas", "Contratos", "Cotizaciones", "Clientes",
  "CRM / Prospectos", "Mantenimiento", "Daños", "Refacciones",
  "Gastos", "Proveedores", "Reportes", "MRR", "Configuración", "Gestión de Usuarios",
  "Feedback",
  "Facturas de Proveedor", "Flujo de Caja", "Cuentas Bancarias", "Conciliación Bancaria",
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
  "/mrr": "MRR",
  "/settings/operations": "Configuración",
  "/settings/company": "Configuración",
  "/users": "Gestión de Usuarios",
  "/returns": "Entregas",
  "/income-statement": "Reportes",
  "/feedback": "Feedback",
  "/cuentas-por-pagar": "Facturas de Proveedor",
  "/cuentas-por-pagar/antiguedad": "Facturas de Proveedor",
  "/flujo-de-caja": "Flujo de Caja",
  "/cuentas-bancarias": "Cuentas Bancarias",
  "/conciliacion-bancaria": "Conciliación Bancaria",
  "/conciliacion-bancaria/historial": "Conciliación Bancaria",
};


export function useRolePermissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["role_permissions", user?.id],
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
      const { data, error } = await supabase
        .from("role_permissions")
        .update({ access_level, updated_at: nowMty().toISOString() })
        .eq("role", role)
        .eq("module", module)
        .select("role");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar permiso de rol");
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
