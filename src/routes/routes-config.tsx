/* eslint-disable react-refresh/only-export-components */
import { lazy, useEffect, useState, type ComponentType } from "react";

// Lazy-loaded pages
const Dashboard = lazy(() => import("@/features/dashboard/pages/Dashboard"));
const FleetPage = lazy(() => import("@/features/fleet/pages/FleetPage"));
const ForkliftDetail = lazy(() => import("@/features/fleet/pages/ForkliftDetail"));
const ForkliftForm = lazy(() => import("@/features/fleet/pages/ForkliftForm"));
const CalendarPage = lazy(() => import("@/features/calendar/pages/CalendarPage"));
const BookingsPage = lazy(() => import("@/features/bookings/pages/BookingsPage"));
const BookingDetail = lazy(() => import("@/features/bookings/pages/BookingDetail"));
const BookingForm = lazy(() => import("@/features/bookings/pages/BookingForm"));
const CustomersPage = lazy(() => import("@/features/customers/pages/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/features/customers/pages/CustomerDetailPage"));
const MaintenancePage = lazy(() => import("@/features/maintenance/pages/MaintenancePage"));
const InvoicesPage = lazy(() => import("@/features/invoices/pages/InvoicesPage"));
const InvoiceForm = lazy(() => import("@/features/invoices/pages/InvoiceForm"));
const InvoiceDetail = lazy(() => import("@/features/invoices/pages/InvoiceDetail"));
const OperationsSetupPage = lazy(() => import("@/features/operations/pages/OperationsSetupPage"));
const ReturnInspectionPage = lazy(() => import("@/features/returns/pages/ReturnInspectionPage"));
const DeliveriesPage = lazy(() => import("@/features/deliveries/pages/DeliveriesPage"));
const DeliveryDetail = lazy(() => import("@/features/deliveries/pages/DeliveryDetail"));
const ReturnInspectionDetail = lazy(() => import("@/features/returns/pages/ReturnInspectionDetail"));
const QuotesPage = lazy(() => import("@/features/quotes/pages/QuotesPage"));
const ContractsPage = lazy(() => import("@/features/contracts/pages/ContractsPage"));
const ContractDetail = lazy(() => import("@/features/contracts/pages/ContractDetail"));
const ContractForm = lazy(() => import("@/features/contracts/pages/ContractForm"));
const QuoteForm = lazy(() => import("@/features/quotes/pages/QuoteForm"));
const QuoteDetail = lazy(() => import("@/features/quotes/pages/QuoteDetail"));
const ActivityPage = lazy(() => import("@/features/audit/pages/ActivityPage"));
const AuditTrailPage = lazy(() => import("@/features/audit/pages/AuditTrailPage"));
const ReportsPage = lazy(() => import("@/features/reports/pages/ReportsPage"));
const DamageTrackingPage = lazy(() => import("@/features/damage/pages/DamageTrackingPage"));
const UserManagementPage = lazy(() => import("@/features/users/pages/UserManagementPage"));
const RolePermissionsPage = lazy(() => import("@/features/users/pages/RolePermissionsPage"));
const CompanySettingsPage = lazy(() => import("@/features/company-settings/pages/CompanySettingsPage"));
const ChangelogPage = lazy(() => import("@/features/changelog/pages/ChangelogPage"));
const HelpPage = lazy(() => import("@/features/help/pages/HelpPage"));
const ExpensesRedirect = lazy(() => import("@/features/accounts-payable/pages/ExpensesRedirect"));
const IncomeStatementPage = lazy(() => import("@/features/reports/pages/IncomeStatementPage"));
const InventoryPage = lazy(() => import("@/features/inventory/pages/InventoryPage"));
const CRMPage = lazy(() => import("@/features/crm/pages/CRMPage"));
const CRMClosedPage = lazy(() => import("@/features/crm/pages/CRMClosedPage"));
const SuppliersPage = lazy(() => import("@/features/suppliers/pages/SuppliersPage"));
const SupplierDetailPage = lazy(() => import("@/features/suppliers/pages/SupplierDetailPage"));
const MrrDetailPage = lazy(() => import("@/features/dashboard/pages/MrrDetailPage"));
const MyReportsPage = lazy(() => import("@/features/feedback/pages/MyReportsPage"));
const LeaderboardPage = lazy(() => import("@/features/feedback/pages/LeaderboardPage"));
const FeedbackManagementPage = lazy(() => import("@/features/feedback/pages/FeedbackManagementPage"));
const CuentasPorPagarPage = lazy(() => import("@/features/accounts-payable/pages/CuentasPorPagarPage"));
const CashFlowPage = lazy(() => import("@/features/cash-flow/pages/CashFlowPage"));
const AgingReportPage = lazy(() => import("@/features/accounts-payable/pages/AgingReportPage"));
const BankAccountsPage = lazy(() => import("@/features/bank-reconciliation/pages/BankAccountsPage"));
const BankReconciliationPage = lazy(() => import("@/features/bank-reconciliation/pages/BankReconciliationPage"));
const BankStatementImportsHistoryPage = lazy(() => import("@/features/bank-reconciliation/pages/BankStatementImportsHistoryPage"));

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
  { path: "/fleet", component: FleetPage, module: "Flota" },
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
  { path: "/expenses", component: ExpensesRedirect },
  { path: "/cuentas-por-pagar", component: CuentasPorPagarPage, module: "Cuentas por Pagar" },
  { path: "/cuentas-por-pagar/antiguedad", component: AgingReportPage, module: "Cuentas por Pagar" },
  { path: "/flujo-de-caja", component: CashFlowPage, module: "Flujo de Caja" },
  { path: "/cuentas-bancarias", component: BankAccountsPage, module: "Cuentas Bancarias" },
  { path: "/conciliacion-bancaria", component: BankReconciliationPage, module: "Conciliación Bancaria" },
  { path: "/conciliacion-bancaria/historial", component: BankStatementImportsHistoryPage, module: "Conciliación Bancaria" },
  { path: "/income-statement", component: IncomeStatementPage, module: "Reportes" },
  { path: "/mrr", component: MrrDetailPage, module: "MRR" },
  { path: "/inventory", component: InventoryPage, module: "Refacciones" },
  { path: "/crm", component: CRMPage, module: "CRM / Prospectos" },
  { path: "/crm/cerrados", component: CRMClosedPage, module: "CRM / Prospectos" },
  { path: "/suppliers", component: SuppliersPage, module: "Proveedores" },
  { path: "/suppliers/:id", component: SupplierDetailPage, module: "Proveedores" },
  { path: "/settings", component: CompanySettingsPage, module: "Configuración" },
  { path: "/settings/operations", component: OperationsSetupPage, module: "Configuración" },
  { path: "/settings/company", component: CompanySettingsPage, module: "Configuración" },
  { path: "/users", component: UserManagementPage, module: "Gestión de Usuarios" },
  { path: "/users/permissions", component: RolePermissionsPage, module: "Gestión de Usuarios" },
  { path: "/changelog", component: ChangelogPage },
  { path: "/help", component: HelpPage },
  { path: "/mis-reportes", component: MyReportsPage },
  { path: "/leaderboard", component: LeaderboardPage },
  { path: "/feedback", component: FeedbackManagementPage, module: "Feedback" },
];
