/* eslint-disable react-refresh/only-export-components --
   Router raíz: exporta rutas + layout + helpers para code-splitting con `lazy`.
   No es un módulo de componentes puros — HMR de rutas requiere reload completo. */
import { type ComponentType, type ReactElement, lazy } from "react";
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
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
 * `adminOnly`). Se aplica dentro de `lazy` para que el bundle del guard
 * y del componente sólo entre al árbol al visitar la ruta.
 */
function wrapWithGuards(
  Component: ComponentType,
  module: string | undefined,
  adminOnly: boolean | undefined,
): ComponentType {
  const Wrapped = () => {
    let element: ReactElement = <Component />;
    if (module) element = <RoleGuard module={module}>{element}</RoleGuard>;
    if (adminOnly) element = <AdminRouteGuard module={module}>{element}</AdminRouteGuard>;
    return element;
  };
  Wrapped.displayName = `Guarded(${Component.displayName ?? Component.name ?? "Route"})`;
  return Wrapped;
}

const PortalLoginLazy = lazy(() => import("@/features/portal/pages/PortalLogin"));
const NotFoundLazy = lazy(() => import("@/features/system/pages/NotFound"));

const authenticatedChildren: RouteObject[] = [
  // Redirect legacy: `<Navigate replace />` evita el flash blanco del loader.
  { path: "/expenses", element: <Navigate to="/cuentas-por-pagar" replace /> },
  ...appRoutes.map<RouteObject>(({ path, loader, module, adminOnly }) => ({
    path,
    // `lazy` de v7: el router hace code-splitting y muestra `HydrateFallback`
    // durante la carga inicial y mantiene la ruta previa durante navegaciones.
    lazy: async () => {
      const mod = await loader();
      return { Component: wrapWithGuards(mod.default, module, adminOnly) };
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
