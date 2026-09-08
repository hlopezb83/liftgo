import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";

const PortalInvoicePayment = lazy(() => import("@/features/portal/pages/PortalInvoicePayment"));

export const Route = createFileRoute("/_portal/portal/invoices/$id/pago")({
  component: () => (
    <Suspense fallback={<PageFallback />}>
      <PortalInvoicePayment />
    </Suspense>
  ),
});
