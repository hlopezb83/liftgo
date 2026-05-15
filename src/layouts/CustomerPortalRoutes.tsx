import { Routes, Route } from "react-router-dom";
import CustomerPortalLayout from "@/layouts/CustomerPortalLayout";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import PortalRentals from "@/pages/portal/PortalRentals";
import PortalInvoices from "@/pages/portal/PortalInvoices";
import PortalInvoiceDetail from "@/pages/portal/PortalInvoiceDetail";
import PortalContracts from "@/pages/portal/PortalContracts";
import MyReportsPage from "@/features/feedback/pages/MyReportsPage";
import LeaderboardPage from "@/features/feedback/pages/LeaderboardPage";

export function CustomerPortalRoutes() {
  return (
    <Routes>
      <Route element={<CustomerPortalLayout />}>
        <Route path="/portal" element={<PortalDashboard />} />
        <Route path="/portal/rentals" element={<PortalRentals />} />
        <Route path="/portal/invoices" element={<PortalInvoices />} />
        <Route path="/portal/invoices/:id" element={<PortalInvoiceDetail />} />
        <Route path="/portal/contracts" element={<PortalContracts />} />
        <Route path="/portal/mis-reportes" element={<MyReportsPage />} />
        <Route path="/portal/leaderboard" element={<LeaderboardPage />} />
        <Route path="*" element={<PortalDashboard />} />
      </Route>
    </Routes>
  );
}
