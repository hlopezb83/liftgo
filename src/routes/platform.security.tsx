import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
const Page = lazy(() => import("@/features/platform/pages/PlatformSecurityPage"));
export const Route = createFileRoute("/platform/security")({
  component: () => <Suspense fallback={<PageFallback />}><Page /></Suspense>,
});
