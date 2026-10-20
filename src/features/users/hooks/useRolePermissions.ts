import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { telemetry } from "@/lib/telemetry";
import type { AppRole } from "./useUserRole";

export type AccessLevel = "full" | "read" | "none";
export type PermissionsMap = Record<string, Record<string, AccessLevel>>;

/** Dispatcher is operational-only in the data layer. Keep stale/custom UI
 * permissions from reopening financial surfaces while migrations roll out. */
export const DISPATCHER_FINANCIAL_MODULES: readonly string[] = [
  "Facturas", "Pagos", "Gastos", "MRR", "Facturas de Proveedor",
  "Flujo de Caja", "Cuentas Bancarias", "Conciliación Bancaria",
];

/** Additional exclusion, never a replacement for module permissions/RLS. */
export function hasFinancialAccess(role: AppRole | null | undefined): boolean {
  return !!role && role !== "dispatcher";
}

/** Shared by sidebar and shortcuts; income statement shares the operational
 * Reportes module but is a financial-only surface. */
export function getRouteAccessLevel(
  perms: PermissionsMap | undefined, role: AppRole | undefined, pathname: string,
): AccessLevel {
  const path = pathname.split(/[?#]/)[0];
  if (path === "/income-statement" && !hasFinancialAccess(role)) return "none";
  const route = Object.keys(ROUTE_TO_MODULE)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || (key !== "/" && path.startsWith(`${key}/`)));
  return route ? getAccessLevel(perms, role, ROUTE_TO_MODULE[route]) : "none";
}

export const MODULES = [
  "Dashboard", "Flota", "Reservas", "Calendario", "Entregas",
  "Facturas", "Contratos", "Cotizaciones", "Clientes",
  "CRM / Prospectos", "Mantenimiento", "Daños", "Refacciones",
  "Gastos", "Proveedores", "Reportes", "MRR", "Configuración", "Gestión de Usuarios",
  "Feedback",
  // v7.226.0 · E2E-N10: Auditoría deja de ser always-visible; se gestiona por rol.
  "Auditoría",
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
  "/invoices/reconciliation": "Facturas",
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
  "/settings/organizations": "Configuración",
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
  // v7.226.0 · E2E-N8/N10: Auditoría gestionable por rol.
  "/audit": "Auditoría",
  "/activity": "Auditoría",
};

const rolePermissionKeys = createEntityKeys("role_permissions");

export function useRolePermissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: user?.id ? rolePermissionKeys.detail(user.id) : rolePermissionKeys.all,
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
  return useEntityMutation({
    mutationFn: async ({ role, module, access_level }: { role: AppRole; module: string; access_level: AccessLevel }) => {
      const { data, error } = await supabase
        .from("role_permissions")
        .update({ access_level, updated_at: new Date().toISOString() })
        .eq("role", role)
        .eq("module", module)
        .select("role");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar permiso de rol");
    },
    invalidateKeys: [rolePermissionKeys.all],
    errorTitle: "Error al actualizar permiso de rol",
  });
}

/** Helper: get access level for a role+module from the permissions map */
export function getAccessLevel(perms: PermissionsMap | undefined, role: AppRole | undefined, module: string): AccessLevel {
  if (!perms || !role) return "none";
  if (role === "dispatcher" && DISPATCHER_FINANCIAL_MODULES.includes(module)) return "none";
  const roleMap = perms[role];
  if (roleMap && !(module in roleMap)) {
    telemetry.warn("RoleGuard", `Módulo "${module}" no existe en role_permissions`, {
      validModules: Object.keys(roleMap),
    });
  }
  return roleMap?.[module] ?? "none";
}
