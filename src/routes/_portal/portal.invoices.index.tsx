import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalInvoices = lazy(() => import("@/features/portal/pages/PortalInvoices"));

export const Route = createFileRoute("/_portal/portal/invoices/")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalInvoices />
    </Suspense>
  ),
});
