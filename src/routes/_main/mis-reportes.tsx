import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const MyReportsPage = lazy(() => import("@/features/feedback/pages/MyReportsPage"));

export const Route = createFileRoute("/_main/mis-reportes")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <MyReportsPage />
    </Suspense>
  ),
});
