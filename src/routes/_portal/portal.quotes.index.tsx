import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalQuotes = lazy(() => import("@/features/portal/pages/PortalQuotes"));

export const Route = createFileRoute("/_portal/portal/quotes/")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalQuotes />
    </Suspense>
  ),
});
