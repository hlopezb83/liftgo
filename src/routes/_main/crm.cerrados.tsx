import { lazy, Suspense, type ReactElement } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const CRMClosedPage = lazy(() => import("@/features/crm/pages/CRMClosedPage"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "CRM / Prospectos";
const minAccess: "read" | "full" | undefined = undefined;

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <CRMClosedPage />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  return element;
}

export const Route = createFileRoute("/_main/crm/cerrados")({
  component: GuardedRoute,
});
