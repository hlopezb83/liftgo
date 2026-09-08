import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalStatement = lazy(() => import("@/features/portal/pages/PortalStatement"));

export const Route = createFileRoute("/_portal/portal/estado-cuenta")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalStatement />
    </Suspense>
  ),
});
