import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const HelpPage = lazy(() => import("@/features/help/pages/HelpPage"));

export const Route = createFileRoute("/_main/help")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <HelpPage />
    </Suspense>
  ),
});
