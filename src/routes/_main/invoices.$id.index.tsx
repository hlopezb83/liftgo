import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, type ReactElement } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const InvoiceDetail = lazy(() => import("@/features/invoices/pages/InvoiceDetail"));

// Guards declarativos preservados de la config de rutas Classic
// (mismo patrón que wrapWithGuards en el router previo).
const module = "Facturas";
const minAccess: "read" | "full" | undefined = undefined;

function GuardedRoute() {
  let element: ReactElement = (
    <Suspense fallback={<PageFallback />}>
      <InvoiceDetail />
    </Suspense>
  );
  if (module) element = <RoleGuard module={module} minAccess={minAccess ?? "read"}>{element}</RoleGuard>;
  return element;
}

export const Route = createFileRoute("/_main/invoices/$id/")({
  component: GuardedRoute,
});
