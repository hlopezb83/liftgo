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

// Route configuration — uses module names from role_permissions table
interface RouteConfig {
  path: string;
  component: ComponentType;
  module?: string;
}

const routes: RouteConfig[] = [
  { path: "/", component: Dashboard, module: "Dashboard" },
  { path: "/fleet", component: Fleet, module: "Flota" },
  { path: "/fleet/new", component: ForkliftForm, module: "Flota" },
  { path: "/fleet/:id", component: ForkliftDetail, module: "Flota" },
  { path: "/fleet/:id/edit", component: ForkliftForm, module: "Flota" },
  { path: "/calendar", component: CalendarPage, module: "Calendario" },
  { path: "/bookings", component: BookingsPage, module: "Reservas" },
  { path: "/bookings/new", component: BookingForm, module: "Reservas" },
  { path: "/customers", component: CustomersPage, module: "Clientes" },
  { path: "/customers/:id", component: CustomerDetailPage, module: "Clientes" },
  { path: "/maintenance", component: MaintenancePage, module: "Mantenimiento" },
  { path: "/invoices", component: InvoicesPage, module: "Facturas" },
  { path: "/invoices/new", component: InvoiceForm, module: "Facturas" },
  { path: "/invoices/:id", component: InvoiceDetail, module: "Facturas" },
  { path: "/invoices/:id/edit", component: InvoiceForm, module: "Facturas" },
  { path: "/returns", component: ReturnInspectionPage, module: "Entregas" },
  { path: "/deliveries", component: DeliveriesPage, module: "Entregas" },
  { path: "/quotes", component: QuotesPage, module: "Cotizaciones" },
  { path: "/quotes/new", component: QuoteForm, module: "Cotizaciones" },
  { path: "/quotes/:id", component: QuoteDetail, module: "Cotizaciones" },
  { path: "/quotes/:id/edit", component: QuoteForm, module: "Cotizaciones" },
  { path: "/contracts", component: ContractsPage, module: "Contratos" },
  { path: "/contracts/new", component: ContractForm, module: "Contratos" },
  { path: "/contracts/:id", component: ContractDetail, module: "Contratos" },
  { path: "/contracts/:id/edit", component: ContractForm, module: "Contratos" },
  { path: "/activity", component: ActivityPage },
  { path: "/audit", component: AuditTrailPage },
  { path: "/reports", component: ReportsPage, module: "Reportes" },
  { path: "/damage", component: DamageTrackingPage, module: "Daños" },
  { path: "/expenses", component: OperatingExpensesPage, module: "Gastos" },
  { path: "/income-statement", component: IncomeStatementPage, module: "Reportes" },
  { path: "/inventory", component: InventoryPage, module: "Refacciones" },
  { path: "/crm", component: CRMPage, module: "CRM / Prospectos" },
  { path: "/suppliers", component: SuppliersPage, module: "Proveedores" },
  { path: "/suppliers/:id", component: SupplierDetailPage, module: "Proveedores" },
  { path: "/settings/operations", component: OperationsSetupPage, module: "Configuración" },
  { path: "/settings/company", component: CompanySettingsPage, module: "Configuración" },
  { path: "/users", component: UserManagementPage, module: "Gestión de Usuarios" },
  { path: "/users/permissions", component: RolePermissionsPage, module: "Gestión de Usuarios" },
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
