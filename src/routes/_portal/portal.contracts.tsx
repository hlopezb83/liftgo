import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalContracts = lazy(() => import("@/features/portal/pages/PortalContracts"));

export const Route = createFileRoute("/_portal/portal/contracts")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalContracts />
    </Suspense>
  ),
});
