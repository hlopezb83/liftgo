import { lazy, Suspense, ComponentType } from "react";
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
import type { AppRole } from "@/hooks/useUserRole";

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

// Route configuration
interface RouteConfig {
  path: string;
  component: ComponentType;
  roles?: AppRole[];
}

const routes: RouteConfig[] = [
  { path: "/", component: Dashboard },
  { path: "/fleet", component: Fleet },
  { path: "/fleet/new", component: ForkliftForm, roles: ["admin"] },
  { path: "/fleet/:id", component: ForkliftDetail },
  { path: "/fleet/:id/edit", component: ForkliftForm, roles: ["admin"] },
  { path: "/calendar", component: CalendarPage },
  { path: "/bookings/new", component: BookingForm, roles: ["admin", "dispatcher"] },
  { path: "/customers", component: CustomersPage },
  { path: "/customers/:id", component: CustomerDetailPage },
  { path: "/maintenance", component: MaintenancePage },
  { path: "/invoices", component: InvoicesPage, roles: ["admin", "dispatcher"] },
  { path: "/invoices/new", component: InvoiceForm, roles: ["admin", "dispatcher"] },
  { path: "/invoices/:id", component: InvoiceDetail, roles: ["admin", "dispatcher"] },
  { path: "/invoices/:id/edit", component: InvoiceForm, roles: ["admin", "dispatcher"] },
  { path: "/returns", component: ReturnInspectionPage, roles: ["admin", "dispatcher"] },
  { path: "/deliveries", component: DeliveriesPage, roles: ["admin", "dispatcher"] },
  { path: "/quotes", component: QuotesPage, roles: ["admin", "dispatcher"] },
  { path: "/quotes/new", component: QuoteForm, roles: ["admin", "dispatcher"] },
  { path: "/quotes/:id", component: QuoteDetail, roles: ["admin", "dispatcher"] },
  { path: "/quotes/:id/edit", component: QuoteForm, roles: ["admin", "dispatcher"] },
  { path: "/contracts", component: ContractsPage, roles: ["admin", "dispatcher"] },
  { path: "/contracts/new", component: ContractForm, roles: ["admin", "dispatcher"] },
  { path: "/contracts/:id", component: ContractDetail, roles: ["admin", "dispatcher"] },
  { path: "/contracts/:id/edit", component: ContractForm, roles: ["admin", "dispatcher"] },
  { path: "/activity", component: ActivityPage },
  { path: "/audit", component: AuditTrailPage, roles: ["admin", "dispatcher"] },
  { path: "/reports", component: ReportsPage, roles: ["admin", "dispatcher"] },
  { path: "/damage", component: DamageTrackingPage },
  { path: "/settings/operations", component: OperationsSetupPage, roles: ["admin"] },
  { path: "/settings/company", component: CompanySettingsPage, roles: ["admin"] },
  { path: "/users", component: UserManagementPage, roles: ["admin"] },
];

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
                      {routes.map(({ path, component: Component, roles }) => (
                        <Route
                          key={path}
                          path={path}
                          element={
                            roles ? (
                              <RoleGuard allowed={roles} fallback={<NoAccess />}>
                                <Component />
                              </RoleGuard>
                            ) : (
                              <Component />
                            )
                          }
                        />
                      ))}
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
