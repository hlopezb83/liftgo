import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
const Page = lazy(() => import("@/features/platform/pages/PlatformEquipmentCatalogPage"));
export const Route = createFileRoute("/platform/catalogs")({
  component: () => <Suspense fallback={<PageFallback />}><Page /></Suspense>,
});
