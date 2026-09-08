import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const LeaderboardPage = lazy(() => import("@/features/feedback/pages/LeaderboardPage"));

export const Route = createFileRoute("/_main/leaderboard")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <LeaderboardPage />
    </Suspense>
  ),
});
