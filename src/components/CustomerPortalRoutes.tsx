import { Routes, Route } from "react-router-dom";
import CustomerPortalLayout from "@/layouts/CustomerPortalLayout";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import PortalRentals from "@/pages/portal/PortalRentals";
import PortalInvoices from "@/pages/portal/PortalInvoices";
import PortalInvoiceDetail from "@/pages/portal/PortalInvoiceDetail";
import PortalContracts from "@/pages/portal/PortalContracts";

export function CustomerPortalRoutes() {
  return (
    <Routes>
      <Route element={<CustomerPortalLayout />}>
        <Route path="/portal" element={<PortalDashboard />} />
        <Route path="/portal/rentals" element={<PortalRentals />} />
        <Route path="/portal/invoices" element={<PortalInvoices />} />
        <Route path="/portal/invoices/:id" element={<PortalInvoiceDetail />} />
        <Route path="/portal/contracts" element={<PortalContracts />} />
        <Route path="*" element={<PortalDashboard />} />
      </Route>
    </Routes>
  );
}
