import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthGuard } from "@/components/AuthGuard";
import { RoleGuard } from "@/components/RoleGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-loaded pages
const PortalLogin = lazy(() => import("./pages/portal/PortalLogin"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Fleet = lazy(() => import("./pages/Fleet"));
const ForkliftDetail = lazy(() => import("./pages/ForkliftDetail"));
const ForkliftForm = lazy(() => import("./pages/ForkliftForm"));
const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const BookingForm = lazy(() => import("./pages/BookingForm"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const CustomerDetailPage = lazy(() => import("./pages/CustomerDetailPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const InvoicesPage = lazy(() => import("./pages/InvoicesPage"));
const InvoiceForm = lazy(() => import("./pages/InvoiceForm"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const OperationsSetupPage = lazy(() => import("./pages/OperationsSetupPage"));
const ReturnInspectionPage = lazy(() => import("./pages/ReturnInspectionPage"));
const DeliveriesPage = lazy(() => import("./pages/DeliveriesPage"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const ContractsPage = lazy(() => import("./pages/ContractsPage"));
const ContractDetail = lazy(() => import("./pages/ContractDetail"));
const ContractForm = lazy(() => import("./pages/ContractForm"));
const QuoteForm = lazy(() => import("./pages/QuoteForm"));
const QuoteDetail = lazy(() => import("./pages/QuoteDetail"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const AuditTrailPage = lazy(() => import("./pages/AuditTrailPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const DamageTrackingPage = lazy(() => import("./pages/DamageTrackingPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage"));
const CompanySettingsPage = lazy(() => import("./pages/CompanySettingsPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="p-6 space-y-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
);

const NoAccess = () => (
  <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
    No tienes permiso para acceder a esta página.
  </div>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="forklift-theme">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/portal/login" element={<Suspense fallback={<PageFallback />}><PortalLogin /></Suspense>} />
          <Route path="*" element={
            <AuthGuard>
              <SidebarProvider>
                <div className="min-h-screen flex w-full">
                  <AppSidebar />
                  <main className="flex-1 overflow-auto">
                    <header className="h-12 flex items-center border-b px-4 bg-card">
                      <SidebarTrigger />
                    </header>
                    <ErrorBoundary>
                    <Suspense fallback={<PageFallback />}>
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
                      <Route path="/contracts" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ContractsPage /></RoleGuard>} />
                      <Route path="/contracts/new" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ContractForm /></RoleGuard>} />
                      <Route path="/contracts/:id" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ContractDetail /></RoleGuard>} />
                      <Route path="/contracts/:id/edit" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ContractForm /></RoleGuard>} />
                      <Route path="/activity" element={<ActivityPage />} />
                      <Route path="/audit" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><AuditTrailPage /></RoleGuard>} />
                      <Route path="/reports" element={<RoleGuard allowed={["admin", "dispatcher"]} fallback={<NoAccess />}><ReportsPage /></RoleGuard>} />
                      <Route path="/damage" element={<DamageTrackingPage />} />
                      <Route path="/settings/operations" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><OperationsSetupPage /></RoleGuard>} />
                      <Route path="/settings/company" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><CompanySettingsPage /></RoleGuard>} />
                      <Route path="/users" element={<RoleGuard allowed={["admin"]} fallback={<NoAccess />}><UserManagementPage /></RoleGuard>} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                    </Suspense>
                    </ErrorBoundary>
                  </main>
                </div>
              </SidebarProvider>
            </AuthGuard>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
