import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const NotFound = lazy(() => import("@/features/system/pages/NotFound"));

export const Route = createFileRoute("/_main/$")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <NotFound />
    </Suspense>
  ),
});
