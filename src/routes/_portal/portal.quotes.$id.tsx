import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalQuoteDetail = lazy(() => import("@/features/portal/pages/PortalQuoteDetail"));

export const Route = createFileRoute("/_portal/portal/quotes/$id")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalQuoteDetail />
    </Suspense>
  ),
});
