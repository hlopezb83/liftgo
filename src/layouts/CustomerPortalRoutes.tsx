import { Routes, Route } from "react-router-dom";
import CustomerPortalLayout from "@/layouts/CustomerPortalLayout";
import PortalDashboard from "@/features/portal";
import PortalRentals from "@/features/portal";
import PortalInvoices from "@/features/portal";
import PortalInvoiceDetail from "@/features/portal";
import PortalInvoicePayment from "@/features/portal";
import PortalContracts from "@/features/portal";
import PortalQuotes from "@/features/portal";
import PortalQuoteDetail from "@/features/portal";
import PortalStatement from "@/features/portal";
import MyReportsPage from "@/features/feedback";
import LeaderboardPage from "@/features/feedback";

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
