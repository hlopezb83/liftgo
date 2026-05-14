import { lazy, useEffect, useState, type ComponentType } from "react";

// Lazy-loaded pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Fleet = lazy(() => import("@/pages/Fleet"));
const ForkliftDetail = lazy(() => import("@/pages/ForkliftDetail"));
const ForkliftForm = lazy(() => import("@/pages/ForkliftForm"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const BookingsPage = lazy(() => import("@/pages/BookingsPage"));
const BookingDetail = lazy(() => import("@/pages/BookingDetail"));
const BookingForm = lazy(() => import("@/pages/BookingForm"));
const CustomersPage = lazy(() => import("@/pages/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/pages/CustomerDetailPage"));
const MaintenancePage = lazy(() => import("@/pages/MaintenancePage"));
const InvoicesPage = lazy(() => import("@/features/invoices/pages/InvoicesPage"));
const InvoiceForm = lazy(() => import("@/features/invoices/pages/InvoiceForm"));
const InvoiceDetail = lazy(() => import("@/features/invoices/pages/InvoiceDetail"));
const OperationsSetupPage = lazy(() => import("@/pages/OperationsSetupPage"));
const ReturnInspectionPage = lazy(() => import("@/pages/ReturnInspectionPage"));
const DeliveriesPage = lazy(() => import("@/pages/DeliveriesPage"));
const DeliveryDetail = lazy(() => import("@/pages/DeliveryDetail"));
const ReturnInspectionDetail = lazy(() => import("@/pages/ReturnInspectionDetail"));
const QuotesPage = lazy(() => import("@/pages/QuotesPage"));
const ContractsPage = lazy(() => import("@/pages/ContractsPage"));
const ContractDetail = lazy(() => import("@/pages/ContractDetail"));
const ContractForm = lazy(() => import("@/pages/ContractForm"));
const QuoteForm = lazy(() => import("@/pages/QuoteForm"));
const QuoteDetail = lazy(() => import("@/pages/QuoteDetail"));
const ActivityPage = lazy(() => import("@/pages/ActivityPage"));
const AuditTrailPage = lazy(() => import("@/pages/AuditTrailPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const DamageTrackingPage = lazy(() => import("@/pages/DamageTrackingPage"));
const UserManagementPage = lazy(() => import("@/pages/UserManagementPage"));
const RolePermissionsPage = lazy(() => import("@/pages/RolePermissionsPage"));
const CompanySettingsPage = lazy(() => import("@/pages/CompanySettingsPage"));
const ChangelogPage = lazy(() => import("@/pages/ChangelogPage"));
const HelpPage = lazy(() => import("@/pages/HelpPage"));
const OperatingExpensesPage = lazy(() => import("@/pages/OperatingExpensesPage"));
const IncomeStatementPage = lazy(() => import("@/pages/IncomeStatementPage"));
const InventoryPage = lazy(() => import("@/pages/InventoryPage"));
const CRMPage = lazy(() => import("@/features/crm/pages/CRMPage"));
const CRMClosedPage = lazy(() => import("@/features/crm/pages/CRMClosedPage"));
const SuppliersPage = lazy(() => import("@/pages/SuppliersPage"));
const SupplierDetailPage = lazy(() => import("@/pages/SupplierDetailPage"));
const MrrDetailPage = lazy(() => import("@/pages/MrrDetailPage"));

// Shared fallback con timeout: si tras 10s sigue cargando, sugerimos recargar.
export const PageFallback = () => {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setStalled(true), 10_000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="h-12 w-12 rounded-xl bg-primary animate-spin [animation-duration:1.5s]" style={{ borderRadius: "30% 70% 70% 30% / 30% 30% 70% 70%" }} />
      <span className="text-sm font-medium text-muted-foreground tracking-wide">Cargando LiftGo…</span>
      {stalled && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="text-xs text-primary underline-offset-4 hover:underline"
        >
          La carga está tardando. Recarga la página
        </button>
      )}
    </div>
  );
};

// Route configuration — uses module names from role_permissions table
export interface RouteConfig {
  path: string;
  component: ComponentType;
  module?: string;
}

export const appRoutes: RouteConfig[] = [
  { path: "/", component: Dashboard, module: "Dashboard" },
  { path: "/fleet", component: Fleet, module: "Flota" },
  { path: "/fleet/new", component: ForkliftForm, module: "Flota" },
  { path: "/fleet/:id", component: ForkliftDetail, module: "Flota" },
  { path: "/fleet/:id/edit", component: ForkliftForm, module: "Flota" },
  { path: "/calendar", component: CalendarPage, module: "Calendario" },
  { path: "/bookings", component: BookingsPage, module: "Reservas" },
  { path: "/bookings/new", component: BookingForm, module: "Reservas" },
  { path: "/bookings/:id", component: BookingDetail, module: "Reservas" },
  { path: "/customers", component: CustomersPage, module: "Clientes" },
  { path: "/customers/:id", component: CustomerDetailPage, module: "Clientes" },
  { path: "/maintenance", component: MaintenancePage, module: "Mantenimiento" },
  { path: "/invoices", component: InvoicesPage, module: "Facturas" },
  { path: "/invoices/new", component: InvoiceForm, module: "Facturas" },
  { path: "/invoices/:id", component: InvoiceDetail, module: "Facturas" },
  { path: "/invoices/:id/edit", component: InvoiceForm, module: "Facturas" },
  { path: "/returns", component: ReturnInspectionPage, module: "Entregas" },
  { path: "/returns/:id", component: ReturnInspectionDetail, module: "Entregas" },
  { path: "/deliveries", component: DeliveriesPage, module: "Entregas" },
  { path: "/deliveries/:id", component: DeliveryDetail, module: "Entregas" },
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
  { path: "/mrr", component: MrrDetailPage, module: "Reportes" },
  { path: "/inventory", component: InventoryPage, module: "Refacciones" },
  { path: "/crm", component: CRMPage, module: "CRM / Prospectos" },
  { path: "/crm/cerrados", component: CRMClosedPage, module: "CRM / Prospectos" },
  { path: "/suppliers", component: SuppliersPage, module: "Proveedores" },
  { path: "/suppliers/:id", component: SupplierDetailPage, module: "Proveedores" },
  { path: "/settings/operations", component: OperationsSetupPage, module: "Configuración" },
  { path: "/settings/company", component: CompanySettingsPage, module: "Configuración" },
  { path: "/users", component: UserManagementPage, module: "Gestión de Usuarios" },
  { path: "/users/permissions", component: RolePermissionsPage, module: "Gestión de Usuarios" },
  { path: "/changelog", component: ChangelogPage },
  { path: "/help", component: HelpPage },
];
