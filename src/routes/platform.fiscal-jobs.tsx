import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
const Page = lazy(() => import("@/features/platform/pages/PlatformFiscalJobsPage"));
export const Route = createFileRoute("/platform/fiscal-jobs")({
  component: () => <Suspense fallback={<PageFallback />}><Page /></Suspense>,
});
