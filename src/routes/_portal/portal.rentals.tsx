import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalRentals = lazy(() => import("@/features/portal/pages/PortalRentals"));

export const Route = createFileRoute("/_portal/portal/rentals")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalRentals />
    </Suspense>
  ),
});
