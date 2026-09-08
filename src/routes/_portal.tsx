import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { AuthGuard } from "@/layouts/AuthGuard";

const CustomerPortalLayout = lazy(() => import("@/layouts/CustomerPortalLayout"));

/**
 * Layout del portal de clientes. `AuthGuard` exige sesión y desvía a los
 * usuarios internos fuera de /portal (y a los clientes hacia /portal desde
 * el árbol principal) — equivalente al CustomerPortalRoutes previo.
 */
function PortalAuthLayout() {
  return (
    <AuthGuard>
      <Suspense fallback={<PageFallback />}>
        <CustomerPortalLayout />
      </Suspense>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/_portal")({
  component: PortalAuthLayout,
});
