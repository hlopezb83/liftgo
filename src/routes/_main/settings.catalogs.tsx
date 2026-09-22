import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { RoleGuard } from "@/layouts/RoleGuard";

const PlatformEquipmentCatalogPage = lazy(
  () => import("@/features/platform/pages/PlatformEquipmentCatalogPage"),
);

function GuardedRoute() {
  return (
    <RoleGuard module="Configuración" minAccess="full">
      <Suspense fallback={<PageFallback />}>
        <PlatformEquipmentCatalogPage />
      </Suspense>
    </RoleGuard>
  );
}

export const Route = createFileRoute("/_main/settings/catalogs")({
  component: GuardedRoute,
});
