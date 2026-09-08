import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const ChangelogPage = lazy(() => import("@/features/changelog/pages/ChangelogPage"));

export const Route = createFileRoute("/_main/changelog")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <ChangelogPage />
    </Suspense>
  ),
});
