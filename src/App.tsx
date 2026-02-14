import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthGuard } from "@/components/AuthGuard";
import { RoleGuard } from "@/components/RoleGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "./pages/Dashboard";
import Fleet from "./pages/Fleet";
import ForkliftDetail from "./pages/ForkliftDetail";
import ForkliftForm from "./pages/ForkliftForm";
import CalendarPage from "./pages/CalendarPage";
import BookingForm from "./pages/BookingForm";
import CustomersPage from "./pages/CustomersPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import MaintenancePage from "./pages/MaintenancePage";
import InvoicesPage from "./pages/InvoicesPage";
import InvoiceForm from "./pages/InvoiceForm";
import InvoiceDetail from "./pages/InvoiceDetail";
import EquipmentConfigPage from "./pages/EquipmentConfigPage";
import ReturnInspectionPage from "./pages/ReturnInspectionPage";
import DeliveriesPage from "./pages/DeliveriesPage";
import QuotesPage from "./pages/QuotesPage";
import QuoteForm from "./pages/QuoteForm";
import QuoteDetail from "./pages/QuoteDetail";
import ActivityPage from "./pages/ActivityPage";
import ReportsPage from "./pages/ReportsPage";
import DamageTrackingPage from "./pages/DamageTrackingPage";
import UserManagementPage from "./pages/UserManagementPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const NoAccess = () => (
  <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
    You do not have permission to access this page.
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthGuard>
          <SidebarProvider>
            <div className="min-h-screen flex w-full">
              <AppSidebar />
              <main className="flex-1 overflow-auto">
                <header className="h-12 flex items-center border-b px-4 bg-card">
                  <SidebarTrigger />
                </header>
                <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/fleet" element={<Fleet />} />
                  <Route path="/fleet/new" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><ForkliftForm /></RoleGuard>} />
                  <Route path="/fleet/:id" element={<ForkliftDetail />} />
                  <Route path="/fleet/:id/edit" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><ForkliftForm /></RoleGuard>} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/bookings/new" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><BookingForm /></RoleGuard>} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/maintenance" element={<MaintenancePage />} />
                  <Route path="/invoices" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><InvoicesPage /></RoleGuard>} />
                  <Route path="/invoices/new" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><InvoiceForm /></RoleGuard>} />
                  <Route path="/invoices/:id" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><InvoiceDetail /></RoleGuard>} />
                  <Route path="/invoices/:id/edit" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><InvoiceForm /></RoleGuard>} />
                  <Route path="/returns" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ReturnInspectionPage /></RoleGuard>} />
                  <Route path="/deliveries" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><DeliveriesPage /></RoleGuard>} />
                  <Route path="/quotes" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><QuotesPage /></RoleGuard>} />
                  <Route path="/quotes/new" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><QuoteForm /></RoleGuard>} />
                  <Route path="/quotes/:id" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><QuoteDetail /></RoleGuard>} />
                  <Route path="/quotes/:id/edit" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><QuoteForm /></RoleGuard>} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/reports" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ReportsPage /></RoleGuard>} />
                  <Route path="/damage" element={<DamageTrackingPage />} />
                  <Route path="/settings/equipment" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><EquipmentConfigPage /></RoleGuard>} />
                  <Route path="/users" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><UserManagementPage /></RoleGuard>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </ErrorBoundary>
              </main>
            </div>
          </SidebarProvider>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
