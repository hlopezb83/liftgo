import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import AuthPage from "@/pages/AuthPage";
import CustomerPortalLayout from "@/layouts/CustomerPortalLayout";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PortalDashboard from "@/pages/portal/PortalDashboard";
import PortalRentals from "@/pages/portal/PortalRentals";
import PortalInvoices from "@/pages/portal/PortalInvoices";
import PortalInvoiceDetail from "@/pages/portal/PortalInvoiceDetail";
import PortalContracts from "@/pages/portal/PortalContracts";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: role, isLoading: roleLoading } = useUserRole();

  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary" />
          <span className="text-lg font-semibold text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <AuthPage />;

  // Customer role → portal layout
  if (role === "customer") {
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

  // Internal staff → normal ERP
  return <>{children}</>;
}
