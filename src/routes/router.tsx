/* eslint-disable react-refresh/only-export-components --
   Router raíz: exporta rutas + layout + helpers para code-splitting con `lazy`.
   No es un módulo de componentes puros — HMR de rutas requiere reload completo. */
import { type ComponentType, type ReactElement, Suspense, lazy } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { getAccessLevel, useRolePermissions, useUserRole } from "@/features/users";
import { AdminRouteGuard } from "@/layouts/AdminRouteGuard";
import { AuthGuard } from "@/layouts/AuthGuard";
import MainLayout from "@/layouts/MainLayout";
import { RoleGuard } from "@/layouts/RoleGuard";
import { RouteErrorElement } from "@/layouts/RouteErrorElement";
import { appRoutes } from "@/routes/routes-config";
import { PageFallback } from "@/routes/RouteSkeletons";

/**
 * `MainLayout` protegido con el `AuthGuard` — sirve como layout raíz para
 * el árbol de rutas autenticadas. `AuthGuard` puede desviar a `AuthPage` o
 * al portal de cliente antes de renderizar el `<Outlet />` del layout.
 */
function AuthLayout() {
  return (
    <AuthGuard>
      <MainLayout />
    </AuthGuard>
  );
}

/**
 * Envuelve el componente de una ruta con los guards declarados (`module`,
 * `adminOnly`, `minAccess`). Se aplica dentro de `lazy` para que el bundle
 * del guard y del componente sólo entre al árbol al visitar la ruta.
 */
function wrapWithGuards(
  Component: ComponentType,
  module: string | undefined,
  adminOnly: boolean | undefined,
  minAccess: "read" | "full" | undefined,
): ComponentType {
  const Wrapped = () => {
    let element: ReactElement = <Component />;
    if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
    if (adminOnly) element = <AdminRouteGuard module={module}>{element}</AdminRouteGuard>;
    return element;
  };
  Wrapped.displayName = `Guarded(${Component.displayName ?? Component.name ?? "Route"})`;
  return Wrapped;
}

const PortalLoginLazy = lazy(() => import("@/features/portal/pages/PortalLogin"));
const NotFoundLazy = lazy(() => import("@/features/system/pages/NotFound"));
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
 * Debe declararse ANTES que el spread de `appRoutes` (misma ruta "/").
 */
function HomeRedirect() {
  const { data: role, isLoading: roleLoading } = useUserRole();
  const { data: perms, isLoading: permsLoading } = useRolePermissions();
  if (roleLoading || permsLoading) return <PageFallback />;
  if (!role || !perms || getAccessLevel(perms, role, "Dashboard") !== "none") {
    return <DashboardLazy />;
  }
  const target = LANDING_CANDIDATES.find((c) => getAccessLevel(perms, role, c.module) !== "none");
  // /help no tiene guard de módulo — aterrizaje seguro si todo es "none".
  return <Navigate to={target?.path ?? "/help"} replace />;
}

const authenticatedChildren: RouteObject[] = [
  // Redirect legacy: `<Navigate replace />` evita el flash blanco del loader.
  { path: "/expenses", element: <Navigate to="/cuentas-por-pagar" replace /> },
  // R12-UIX-08: alias históricos que quedaban en 404.
  { path: "/accounts-payable", element: <Navigate to="/cuentas-por-pagar" replace /> },
  { path: "/payments", element: <Navigate to="/invoices" replace /> },
  { path: "/prospects", element: <Navigate to="/crm" replace /> },
  { path: "/availability", element: <Navigate to="/calendar" replace /> },
  { path: "/cash-flow", element: <Navigate to="/flujo-de-caja" replace /> },
  // R13-P2-06: alias inglés/corto de conciliación bancaria.
  { path: "/conciliacion", element: <Navigate to="/conciliacion-bancaria" replace /> },
  { path: "/bank-reconciliation", element: <Navigate to="/conciliacion-bancaria" replace /> },
  // GUI-FE-04 (R9): /customers/new no existía → "/customers/:id" capturaba
  // "new" como id (UUID inválido → error SQL crudo). El alta real es un
  // diálogo en la lista; redirigimos abriendo ese diálogo por query param.
  { path: "/customers/new", element: <Navigate to="/customers?new=1" replace /> },
  // GUI-FE-09 (G-UX-08): /login no existía → 404 con sesión activa.
  // Sin sesión, AuthGuard muestra la pantalla de login inline; con sesión,
  // "/" resuelve el módulo correcto por rol vía HomeRedirect.
  { path: "/login", element: <Navigate to="/" replace /> },
  {
    path: "/",
    element: (
      <Suspense fallback={<PageFallback />}>
        <HomeRedirect />
      </Suspense>
    ),
  },
  ...appRoutes.map<RouteObject>(({ path, loader, module, adminOnly, minAccess }) => ({
    path,
    // `lazy` de v7: el router hace code-splitting y muestra `HydrateFallback`
    // durante la carga inicial y mantiene la ruta previa durante navegaciones.
    lazy: async () => {
      const mod = await loader();
      return { Component: wrapWithGuards(mod.default, module, adminOnly, minAccess) };
    },
    HydrateFallback: PageFallback,
  })),
  { path: "*", Component: NotFoundLazy },
];

export const router = createBrowserRouter([
  {
    path: "/portal/login",
    Component: PortalLoginLazy,
    errorElement: <RouteErrorElement />,
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorElement />,
    children: authenticatedChildren,
  },
]);
