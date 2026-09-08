import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalDashboard = lazy(() => import("@/features/portal/pages/PortalDashboard"));

export const Route = createFileRoute("/_portal/portal/$")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalDashboard />
    </Suspense>
  ),
});
