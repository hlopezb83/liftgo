import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, type ReactElement } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const PlatformOrganizationsPage = lazy(
  () => import("@/features/platform/pages/PlatformOrganizationsPage"),
);

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
// La autorización real es server-side (`requirePlatformOperator`); la página
// además oculta su contenido si el servidor no confirma al operador.
const module = "Configuración";
const minAccess: "read" | "full" | undefined = "full";

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <PlatformOrganizationsPage />
    </Suspense>
  );
  if (module)
    element = (
      <RoleGuard module={module} minAccess={minAccess ?? "read"}>
        {element}
      </RoleGuard>
    );
  return element;
}

export const Route = createFileRoute("/_main/settings/organizations")({
  component: GuardedRoute,
});
