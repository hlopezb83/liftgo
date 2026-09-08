import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const ChangelogPage = lazy(() => import("@/features/changelog/pages/ChangelogPage"));

export const Route = createFileRoute("/_main/changelog")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <ChangelogPage />
    </Suspense>
  ),
});
