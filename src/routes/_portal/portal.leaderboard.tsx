import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const LeaderboardPage = lazy(() => import("@/features/feedback/pages/LeaderboardPage"));

export const Route = createFileRoute("/_portal/portal/leaderboard")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <LeaderboardPage />
    </Suspense>
  ),
});
