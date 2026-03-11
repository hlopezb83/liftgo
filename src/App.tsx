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
const BookingsPage = lazy(() => import("./pages/BookingsPage"));
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
const RolePermissionsPage = lazy(() => import("./pages/RolePermissionsPage"));
const CompanySettingsPage = lazy(() => import("./pages/CompanySettingsPage"));
const ChangelogPage = lazy(() => import("./pages/ChangelogPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const OperatingExpensesPage = lazy(() => import("./pages/OperatingExpensesPage"));
const IncomeStatementPage = lazy(() => import("./pages/IncomeStatementPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const CRMPage = lazy(() => import("./pages/CRMPage"));
const SuppliersPage = lazy(() => import("./pages/SuppliersPage"));
const SupplierDetailPage = lazy(() => import("./pages/SupplierDetailPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
    <div className="h-12 w-12 rounded-xl bg-primary animate-spin [animation-duration:1.5s]" style={{ borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" }} />
    <span className="text-sm font-medium text-muted-foreground tracking-wide">Cargando LiftGo…</span>
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
  { path: "/fleet/new", component: ForkliftForm, roles: ["admin", "administrativo"] },
  { path: "/fleet/:id", component: ForkliftDetail },
  { path: "/fleet/:id/edit", component: ForkliftForm, roles: ["admin", "administrativo"] },
  { path: "/calendar", component: CalendarPage },
  { path: "/bookings", component: BookingsPage, roles: ["admin", "dispatcher", "administrativo", "auditor", "ventas"] },
  { path: "/bookings/new", component: BookingForm, roles: ["admin", "dispatcher", "administrativo"] },
  { path: "/customers", component: CustomersPage },
  { path: "/customers/:id", component: CustomerDetailPage },
  { path: "/maintenance", component: MaintenancePage },
  { path: "/invoices", component: InvoicesPage, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/invoices/new", component: InvoiceForm, roles: ["admin", "dispatcher", "administrativo"] },
  { path: "/invoices/:id", component: InvoiceDetail, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/invoices/:id/edit", component: InvoiceForm, roles: ["admin", "dispatcher", "administrativo"] },
  { path: "/returns", component: ReturnInspectionPage, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/deliveries", component: DeliveriesPage, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/quotes", component: QuotesPage, roles: ["admin", "dispatcher", "administrativo", "auditor", "ventas"] },
  { path: "/quotes/new", component: QuoteForm, roles: ["admin", "dispatcher", "administrativo", "ventas"] },
  { path: "/quotes/:id", component: QuoteDetail, roles: ["admin", "dispatcher", "administrativo", "auditor", "ventas"] },
  { path: "/quotes/:id/edit", component: QuoteForm, roles: ["admin", "dispatcher", "administrativo", "ventas"] },
  { path: "/contracts", component: ContractsPage, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/contracts/new", component: ContractForm, roles: ["admin", "dispatcher", "administrativo"] },
  { path: "/contracts/:id", component: ContractDetail, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/contracts/:id/edit", component: ContractForm, roles: ["admin", "dispatcher", "administrativo"] },
  { path: "/activity", component: ActivityPage },
  { path: "/audit", component: AuditTrailPage, roles: ["admin", "dispatcher", "administrativo", "auditor"] },
  { path: "/reports", component: ReportsPage, roles: ["admin", "dispatcher", "administrativo", "auditor", "ventas"] },
  { path: "/damage", component: DamageTrackingPage },
  { path: "/expenses", component: OperatingExpensesPage, roles: ["admin", "administrativo", "auditor"] },
  { path: "/income-statement", component: IncomeStatementPage, roles: ["admin", "administrativo", "auditor"] },
  { path: "/inventory", component: InventoryPage, roles: ["admin", "administrativo", "mechanic", "auditor"] },
  { path: "/crm", component: CRMPage, roles: ["admin", "dispatcher", "administrativo", "auditor", "ventas"] },
  { path: "/suppliers", component: SuppliersPage, roles: ["admin", "administrativo", "auditor"] },
  { path: "/suppliers/:id", component: SupplierDetailPage, roles: ["admin", "administrativo", "auditor"] },
  { path: "/settings/operations", component: OperationsSetupPage, roles: ["admin", "administrativo", "auditor"] },
  { path: "/settings/company", component: CompanySettingsPage, roles: ["admin", "auditor"] },
  { path: "/users", component: UserManagementPage, roles: ["admin", "auditor"] },
  { path: "/users/permissions", component: RolePermissionsPage, roles: ["admin", "auditor"] },
  { path: "/changelog", component: ChangelogPage },
  { path: "/help", component: HelpPage },
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
