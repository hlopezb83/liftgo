import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalInvoiceDetail = lazy(() => import("@/features/portal/pages/PortalInvoiceDetail"));

export const Route = createFileRoute("/_portal/portal/invoices/$id/")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalInvoiceDetail />
    </Suspense>
  ),
});
