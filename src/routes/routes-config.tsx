/* eslint-disable react-refresh/only-export-components */
import { lazy, type ComponentType } from "react";

export { PageFallback } from "@/routes/RouteSkeletons";

// -----------------------------------------------------------------------------
// Ruta canónica: `path`, `loader` (import dinámico), `module` para permisos.
// `component` se deriva con `lazy(loader)`. Exponer `loader` permite prefetch
// del chunk desde el sidebar / global search antes del click.
// -----------------------------------------------------------------------------

type Loader = () => Promise<{ default: ComponentType }>;
/** Nivel mínimo de permiso para acceder a la ruta. Default: "read". */
export type RouteAccess = "read" | "full";

interface RawRoute {
  path: string;
  loader: Loader;
  module?: string;
  adminOnly?: boolean;
  /** Sube el mínimo requerido por RoleGuard (default: "read"). */
  minAccess?: RouteAccess;
}

const rawRoutes: RawRoute[] = [
  { path: "/", loader: () => import("@/features/dashboard/pages/Dashboard"), module: "Dashboard" },
  { path: "/fleet", loader: () => import("@/features/fleet/pages/FleetPage"), module: "Flota" },
  { path: "/fleet/new", loader: () => import("@/features/fleet/pages/ForkliftForm"), module: "Flota" },
  { path: "/fleet/:id", loader: () => import("@/features/fleet/pages/ForkliftDetail"), module: "Flota" },
  { path: "/fleet/:id/edit", loader: () => import("@/features/fleet/pages/ForkliftForm"), module: "Flota" },
  { path: "/calendar", loader: () => import("@/features/calendar/pages/CalendarPage"), module: "Calendario" },
  { path: "/bookings", loader: () => import("@/features/bookings/pages/BookingsPage"), module: "Reservas" },
  { path: "/bookings/new", loader: () => import("@/features/bookings/pages/BookingForm"), module: "Reservas", adminOnly: true },
  { path: "/bookings/:id", loader: () => import("@/features/bookings/pages/BookingDetail"), module: "Reservas" },
  { path: "/customers", loader: () => import("@/features/customers/pages/CustomersPage"), module: "Clientes" },
  { path: "/customers/:id", loader: () => import("@/features/customers/pages/CustomerDetailPage"), module: "Clientes" },
  { path: "/maintenance", loader: () => import("@/features/maintenance/pages/MaintenancePage"), module: "Mantenimiento" },
  { path: "/invoices", loader: () => import("@/features/invoices/pages/InvoicesPage"), module: "Facturas" },
  { path: "/invoices/new", loader: () => import("@/features/invoices/pages/InvoiceForm"), module: "Facturas", minAccess: "full" },
  { path: "/invoices/reconciliation", loader: () => import("@/features/invoices/pages/InvoicesReconciliation"), module: "Facturas" },
  { path: "/invoices/:id", loader: () => import("@/features/invoices/pages/InvoiceDetail"), module: "Facturas" },
  { path: "/invoices/:id/edit", loader: () => import("@/features/invoices/pages/InvoiceForm"), module: "Facturas", minAccess: "full" },
  { path: "/returns", loader: () => import("@/features/returns/pages/ReturnInspectionPage"), module: "Entregas" },
  { path: "/returns/pending", loader: () => import("@/features/returns/pages/PendingReturnsPage"), module: "Entregas" },
  { path: "/returns/:id", loader: () => import("@/features/returns/pages/ReturnInspectionDetail"), module: "Entregas" },
  { path: "/deliveries", loader: () => import("@/features/deliveries/pages/DeliveriesPage"), module: "Entregas" },
  { path: "/deliveries/:id", loader: () => import("@/features/deliveries/pages/DeliveryDetail"), module: "Entregas" },
  { path: "/quotes", loader: () => import("@/features/quotes/pages/QuotesPage"), module: "Cotizaciones" },
  { path: "/quotes/new", loader: () => import("@/features/quotes/pages/QuoteForm"), module: "Cotizaciones" },
  { path: "/quotes/:id", loader: () => import("@/features/quotes/pages/QuoteDetail"), module: "Cotizaciones" },
  { path: "/quotes/:id/edit", loader: () => import("@/features/quotes/pages/QuoteForm"), module: "Cotizaciones" },
  { path: "/contracts", loader: () => import("@/features/contracts/pages/ContractsPage"), module: "Contratos" },
  { path: "/contracts/new", loader: () => import("@/features/contracts/pages/ContractForm"), module: "Contratos" },
  { path: "/contracts/:id", loader: () => import("@/features/contracts/pages/ContractDetail"), module: "Contratos" },
  { path: "/contracts/:id/edit", loader: () => import("@/features/contracts/pages/ContractForm"), module: "Contratos" },
  { path: "/activity", loader: () => import("@/features/audit/pages/ActivityPage"), module: "Auditoría" },
  { path: "/audit", loader: () => import("@/features/audit/pages/AuditTrailPage"), module: "Auditoría" },
  { path: "/reports", loader: () => import("@/features/reports/pages/ReportsPage"), module: "Reportes" },
  { path: "/damage", loader: () => import("@/features/damage/pages/DamageTrackingPage"), module: "Daños" },
  { path: "/cuentas-por-pagar", loader: () => import("@/features/accounts-payable/pages/CuentasPorPagarPage"), module: "Facturas de Proveedor" },
  { path: "/cuentas-por-pagar/antiguedad", loader: () => import("@/features/accounts-payable/pages/AgingReportPage"), module: "Facturas de Proveedor" },
  { path: "/flujo-de-caja", loader: () => import("@/features/cash-flow/pages/CashFlowPage"), module: "Flujo de Caja" },
  { path: "/cuentas-bancarias", loader: () => import("@/features/bank-reconciliation/pages/BankAccountsPage"), module: "Cuentas Bancarias" },
  { path: "/conciliacion-bancaria", loader: () => import("@/features/bank-reconciliation/pages/BankReconciliationPage"), module: "Conciliación Bancaria" },
  { path: "/conciliacion-bancaria/historial", loader: () => import("@/features/bank-reconciliation/pages/BankStatementImportsHistoryPage"), module: "Conciliación Bancaria" },
  { path: "/income-statement", loader: () => import("@/features/reports/pages/IncomeStatementPage"), module: "Reportes" },
  { path: "/mrr", loader: () => import("@/features/dashboard/pages/MrrDetailPage"), module: "MRR" },
  { path: "/inventory", loader: () => import("@/features/inventory/pages/InventoryPage"), module: "Refacciones" },
  { path: "/crm", loader: () => import("@/features/crm/pages/CRMPage"), module: "CRM / Prospectos" },
  { path: "/crm/cerrados", loader: () => import("@/features/crm/pages/CRMClosedPage"), module: "CRM / Prospectos" },
  { path: "/suppliers", loader: () => import("@/features/suppliers/pages/SuppliersPage"), module: "Proveedores" },
  { path: "/suppliers/:id", loader: () => import("@/features/suppliers/pages/SupplierDetailPage"), module: "Proveedores" },
  { path: "/settings", loader: () => import("@/features/company-settings/pages/CompanySettingsPage"), module: "Configuración" },
  { path: "/settings/operations", loader: () => import("@/features/operations/pages/OperationsSetupPage"), module: "Configuración" },
  { path: "/settings/company", loader: () => import("@/features/company-settings/pages/CompanySettingsPage"), module: "Configuración" },
  { path: "/users", loader: () => import("@/features/users/pages/UserManagementPage"), module: "Gestión de Usuarios" },
  { path: "/users/permissions", loader: () => import("@/features/users/pages/RolePermissionsPage"), module: "Gestión de Usuarios" },
  { path: "/changelog", loader: () => import("@/features/changelog/pages/ChangelogPage") },
  { path: "/help", loader: () => import("@/features/help/pages/HelpPage") },
  { path: "/mis-reportes", loader: () => import("@/features/feedback/pages/MyReportsPage") },
  { path: "/leaderboard", loader: () => import("@/features/feedback/pages/LeaderboardPage") },
  { path: "/feedback", loader: () => import("@/features/feedback/pages/FeedbackManagementPage"), module: "Feedback" },
];

// Route configuration — uses module names from role_permissions table
export interface RouteConfig {
  path: string;
  component: ComponentType;
  loader: Loader;
  module?: string;
  adminOnly?: boolean;
  minAccess?: RouteAccess;
}

export const appRoutes: RouteConfig[] = rawRoutes.map((r) => ({
  ...r,
  component: lazy(r.loader),
}));

/**
 * Índice URL → loader para prefetch de chunks lazy desde NavLink hover.
 * Sólo rutas estáticas (sin `:param`) — las dinámicas se prefetchean con
 * `usePrefetchOnHover` desde la fila que las origina.
 */
export const routeLoaders: Record<string, Loader> = Object.fromEntries(
  rawRoutes.filter((r) => !r.path.includes(":")).map((r) => [r.path, r.loader]),
);
