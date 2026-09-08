import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { NoAccess } from "@/layouts/NoAccess";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Navigate } from "@/lib/router-compat-ui";

const DashboardLazy = lazy(() => import("@/features/dashboard/pages/Dashboard"));

/**
 * GUI-FE-09 (G-MEC-05): candidatos de aterrizaje por orden operativo para
 * roles sin acceso al Dashboard (p. ej. mechanic: Dashboard=none).
 */
const LANDING_CANDIDATES: { module: string; path: string }[] = [
  { module: "Reservas", path: "/bookings" },
  { module: "Entregas", path: "/deliveries" },
  { module: "Flota", path: "/fleet" },
  { module: "Mantenimiento", path: "/maintenance" },
  { module: "Cotizaciones", path: "/quotes" },
];

/**
 * "/" con redirect por rol: si el rol puede ver Dashboard lo renderiza;
 * si no, redirige al primer módulo permitido en vez de mostrar "Sin permisos".
 */
function HomeRedirect() {
  const { data: role, isLoading: roleLoading, isError: roleError } = useUserRole();
  const { data: perms, isLoading: permsLoading, isError: permsError } = useRolePermissions();
  if (roleLoading || permsLoading) return <PageFallback />;
  // M-4: fail-closed — si no se pudo verificar rol/permisos, NO renderizar el
  // Dashboard sin guard.
  if (roleError || permsError) return <NoAccess module="Dashboard" reason="error" />;
  if (!role) return <NoAccess module="Dashboard" reason="no-role" />;
  if (!perms || getAccessLevel(perms, role, "Dashboard") !== "none") {
    return (
      <RoleGuard module="Dashboard">
        <DashboardLazy />
      </RoleGuard>
    );
  }
  const target = LANDING_CANDIDATES.find((c) => getAccessLevel(perms, role, c.module) !== "none");
  // /help no tiene guard de módulo — aterrizaje seguro si todo es "none".
  return <Navigate to={target?.path ?? "/help"} replace />;
}

export const Route = createFileRoute("/_main/")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <HomeRedirect />
    </Suspense>
  ),
});
