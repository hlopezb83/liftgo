import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, type ReactElement } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const AgingReportPage = lazy(() => import("@/features/accounts-payable/pages/AgingReportPage"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "Facturas de Proveedor";
const minAccess: "read" | "full" | undefined = undefined;

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <AgingReportPage />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  return element;
}

export const Route = createFileRoute("/_main/cuentas-por-pagar/antiguedad")({
  component: GuardedRoute,
});
