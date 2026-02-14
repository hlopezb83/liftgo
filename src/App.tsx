import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthGuard } from "@/components/AuthGuard";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/fleet" element={<Fleet />} />
                  <Route path="/fleet/new" element={<ForkliftForm />} />
                  <Route path="/fleet/:id" element={<ForkliftDetail />} />
                  <Route path="/fleet/:id/edit" element={<ForkliftForm />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/bookings/new" element={<BookingForm />} />
                  <Route path="/customers" element={<CustomersPage />} />
                  <Route path="/customers/:id" element={<CustomerDetailPage />} />
                  <Route path="/maintenance" element={<MaintenancePage />} />
                  <Route path="/invoices" element={<InvoicesPage />} />
                  <Route path="/invoices/new" element={<InvoiceForm />} />
                  <Route path="/invoices/:id" element={<InvoiceDetail />} />
                  <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
                  <Route path="/returns" element={<ReturnInspectionPage />} />
                  <Route path="/deliveries" element={<DeliveriesPage />} />
                  <Route path="/quotes" element={<QuotesPage />} />
                  <Route path="/quotes/new" element={<QuoteForm />} />
                  <Route path="/quotes/:id" element={<QuoteDetail />} />
                  <Route path="/quotes/:id/edit" element={<QuoteForm />} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/damage" element={<DamageTrackingPage />} />
                  <Route path="/settings/equipment" element={<EquipmentConfigPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
            </div>
          </SidebarProvider>
        </AuthGuard>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
