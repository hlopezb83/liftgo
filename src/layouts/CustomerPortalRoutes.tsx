import { Routes, Route } from "react-router-dom";
import CustomerPortalLayout from "@/layouts/CustomerPortalLayout";
import PortalDashboard from "@/features/portal/pages/PortalDashboard";
import PortalRentals from "@/features/portal/pages/PortalRentals";
import PortalInvoices from "@/features/portal/pages/PortalInvoices";
import PortalInvoiceDetail from "@/features/portal/pages/PortalInvoiceDetail";
import PortalInvoicePayment from "@/features/portal/pages/PortalInvoicePayment";
import PortalContracts from "@/features/portal/pages/PortalContracts";
import PortalQuotes from "@/features/portal/pages/PortalQuotes";
import PortalQuoteDetail from "@/features/portal/pages/PortalQuoteDetail";
import PortalStatement from "@/features/portal/pages/PortalStatement";
import MyReportsPage from "@/features/feedback/pages/MyReportsPage";
import LeaderboardPage from "@/features/feedback/pages/LeaderboardPage";

export function CustomerPortalRoutes() {
  return (
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
  );
}
