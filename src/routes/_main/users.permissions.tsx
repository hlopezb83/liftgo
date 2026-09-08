import { lazy, Suspense, type ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const RolePermissionsPage = lazy(() => import("@/features/users/pages/RolePermissionsPage"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "Gestión de Usuarios";
const minAccess: "read" | "full" | undefined = undefined;

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <RolePermissionsPage />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  return element;
}

export const Route = createFileRoute("/_main/users/permissions")({
  component: GuardedRoute,
});
