import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
const Page = lazy(() => import("@/features/platform/pages/PlatformLoginPage"));
/** Ruta pública fuera del padre protegido /platform. */
export const Route = createFileRoute("/platform_/login")({
  component: () => <Suspense fallback={<PageFallback />}><Page /></Suspense>,
});
