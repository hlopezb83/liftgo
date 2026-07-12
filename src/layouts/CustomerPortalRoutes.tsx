import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router";
import { PageFallback } from "@/routes/routes-config";

const CustomerPortalLayout = lazy(() => import("@/layouts/CustomerPortalLayout"));
const PortalDashboard = lazy(() => import("@/features/portal/pages/PortalDashboard"));
const PortalRentals = lazy(() => import("@/features/portal/pages/PortalRentals"));
const PortalInvoices = lazy(() => import("@/features/portal/pages/PortalInvoices"));
const PortalInvoiceDetail = lazy(() => import("@/features/portal/pages/PortalInvoiceDetail"));
const PortalInvoicePayment = lazy(() => import("@/features/portal/pages/PortalInvoicePayment"));
const PortalContracts = lazy(() => import("@/features/portal/pages/PortalContracts"));
const PortalQuotes = lazy(() => import("@/features/portal/pages/PortalQuotes"));
const PortalQuoteDetail = lazy(() => import("@/features/portal/pages/PortalQuoteDetail"));
const PortalStatement = lazy(() => import("@/features/portal/pages/PortalStatement"));
const MyReportsPage = lazy(() => import("@/features/feedback/pages/MyReportsPage"));
const LeaderboardPage = lazy(() => import("@/features/feedback/pages/LeaderboardPage"));

export function CustomerPortalRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<CustomerPortalLayout />}>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/rentals" element={<PortalRentals />} />
          <Route path="/portal/quotes" element={<PortalQuotes />} />
          <Route path="/portal/quotes/:id" element={<PortalQuoteDetail />} />
          <Route path="/portal/invoices" element={<PortalInvoices />} />
          <Route path="/portal/invoices/:id" element={<PortalInvoiceDetail />} />
          <Route path="/portal/invoices/:id/pago" element={<PortalInvoicePayment />} />
          <Route path="/portal/estado-cuenta" element={<PortalStatement />} />
          <Route path="/portal/contracts" element={<PortalContracts />} />
          <Route path="/portal/mis-reportes" element={<MyReportsPage />} />
          <Route path="/portal/leaderboard" element={<LeaderboardPage />} />
          <Route path="*" element={<PortalDashboard />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
