import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalLogin = lazy(() => import("@/features/portal/pages/PortalLogin"));

export const Route = createFileRoute("/portal/login")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalLogin />
    </Suspense>
  ),
});
