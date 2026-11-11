import { DashboardIcon, CalendarDays, BookOpen, DeliveryIcon, ClipboardCheck, TargetIcon, UsersIcon, DocumentIcon, ScrollText, FleetIcon, MaintenanceIcon, WarnIcon, InventoryIcon, InvoiceIcon, GitCompareArrows, TrendingUpIcon, BankIcon, ArrowLeftRight, ChartIcon, SupplierIcon, FileClock, ActivityIcon, HistoryIcon, SecurityIcon, SettingsIcon, HelpIcon, MessageSquare, TrophyIcon, Megaphone, ExpenseIcon, CompanyIcon } from "@/components/icons";
import type { ElementType } from "react";

export type SidebarBadgeKey =
  | "maintenance_open"
  | "deliveries_today"
  | "returns_today"
  | "intents_pending"
  | "changelog_new";
export type NavItem = {
  title: string;
  url: string;
  /** Destino opcional sin cambiar el path usado para permisos y estado activo. */
  destination?: string;
  icon: ElementType;
  badgeKey?: SidebarBadgeKey;
  /**
   * Tramo 9 multiempresa: sólo visible para operadores de plataforma
   * (`platform_operators`), además del permiso del módulo. El servidor vuelve
   * a verificar al operador en cada acción; esto es únicamente visibilidad.
   */
  platformOperatorOnly?: boolean;
};
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean; defaultOpen?: boolean };

export type SearchNavigationItem = { title: string; url: string; icon: ElementType; group: string; keywords?: string };

/** Shared display metadata, not a route registry or an authorization guard.
 * Surface membership and ordering remain explicit below: search intentionally
 * has fewer destinations and its legacy /expenses alias. Shared destinations
 * use the same names and groups on both surfaces.
 */
const DESTINATIONS = {
  home: { title: "Panel", url: "/", icon: DashboardIcon },
  calendar: { title: "Calendario", url: "/calendar", icon: CalendarDays },
  bookings: { title: "Reservas", url: "/bookings", icon: BookOpen },
  deliveries: { title: "Entregas", url: "/deliveries", icon: DeliveryIcon },
  returns: { title: "Devoluciones", url: "/returns", icon: ClipboardCheck },
  crm: { title: "CRM", url: "/crm", icon: TargetIcon },
  customers: { title: "Clientes", url: "/customers", icon: UsersIcon },
  quotes: { title: "Cotizaciones", url: "/quotes", icon: DocumentIcon },
  contracts: { title: "Contratos", url: "/contracts", icon: ScrollText },
  fleet: { title: "Equipos", url: "/fleet", icon: FleetIcon },
  maintenance: { title: "Mantenimiento", url: "/maintenance", icon: MaintenanceIcon },
  damage: { title: "Daños", url: "/damage", icon: WarnIcon },
  inventory: { title: "Refacciones", url: "/inventory", icon: InventoryIcon },
  invoices: { title: "Facturas", url: "/invoices", icon: InvoiceIcon },
  invoicesReconciliation: { title: "Conciliación CFDI", url: "/invoices/reconciliation", icon: GitCompareArrows },
  flujoDeCaja: { title: "Flujo de caja", url: "/flujo-de-caja", icon: TrendingUpIcon },
  cuentasBancarias: { title: "Cuentas bancarias", url: "/cuentas-bancarias", icon: BankIcon },
  conciliacionBancaria: { title: "Conciliación bancaria", url: "/conciliacion-bancaria", icon: ArrowLeftRight },
  incomeStatement: { title: "Estado de resultados", url: "/income-statement", icon: ChartIcon },
  suppliers: { title: "Proveedores", url: "/suppliers", icon: SupplierIcon },
  cuentasPorPagar: { title: "Facturas de proveedor", url: "/cuentas-por-pagar", icon: FileClock },
  reports: { title: "Reportes", url: "/reports", icon: ChartIcon },
  mrr: { title: "Métricas de renta", url: "/mrr", icon: TrendingUpIcon },
  activity: { title: "Actividad", url: "/activity", icon: ActivityIcon },
  audit: { title: "Bitácora", url: "/audit", icon: HistoryIcon },
  users: { title: "Usuarios", url: "/users", icon: SecurityIcon },
  settingsOperations: { title: "Configuración", url: "/settings/operations", icon: SettingsIcon },
  platform: { title: "Centro de Plataforma", url: "/platform", icon: SecurityIcon },
  help: { title: "Ayuda", url: "/help", icon: HelpIcon },
  changelog: { title: "Historial de cambios", url: "/changelog", icon: ScrollText },
  misReportes: { title: "Mis reportes", url: "/mis-reportes", icon: MessageSquare },
  leaderboard: { title: "Tabla de honor", url: "/leaderboard", icon: TrophyIcon },
  feedback: { title: "Gestión de reportes", url: "/feedback", icon: Megaphone },
  expenses: { title: "Facturas de proveedor", url: "/expenses", icon: ExpenseIcon },
  settingsCompany: { title: "Datos fiscales", url: "/settings/company", icon: CompanyIcon },
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [
      { ...DESTINATIONS.home },
      { ...DESTINATIONS.calendar },
    ],
  },
  {
    // Flujo del día a día de una rentadora: lo usa el 80% de los roles.
    // Sin colapsar y arriba — antes estaba escondido en un grupo colapsado.
    label: "Operación diaria",
    items: [
      { ...DESTINATIONS.bookings },
      { ...DESTINATIONS.deliveries, badgeKey: "deliveries_today" },
      { ...DESTINATIONS.returns, badgeKey: "returns_today" },
    ],
  },
  {
    label: "Ventas",
    collapsible: true,
    defaultOpen: true, // pipeline comercial: uso frecuente
    items: [
      { ...DESTINATIONS.crm },
      { ...DESTINATIONS.customers },
      { ...DESTINATIONS.quotes },
      { ...DESTINATIONS.contracts },
    ],
  },
  {
    label: "Flota",
    items: [
      { ...DESTINATIONS.fleet },
      { ...DESTINATIONS.maintenance, badgeKey: "maintenance_open" },
      { ...DESTINATIONS.damage },
      { ...DESTINATIONS.inventory },
    ],
  },
  {
    // Renombrado de "Facturación y Finanzas": más corto y directo.
    label: "Finanzas",
    collapsible: true,
    items: [
      { ...DESTINATIONS.invoices, badgeKey: "intents_pending" },
      // Renombrado de "Conciliación": había DOS "Conciliación" en el mismo
      // grupo (pagos vs bancaria). Ahora son inequívocas.
      { ...DESTINATIONS.invoicesReconciliation },
      { ...DESTINATIONS.flujoDeCaja },
      { ...DESTINATIONS.cuentasBancarias },
      { ...DESTINATIONS.conciliacionBancaria },
      { ...DESTINATIONS.incomeStatement },
    ],
  },
  {
    label: "Compras",
    collapsible: true,
    items: [
      { ...DESTINATIONS.suppliers },
      { ...DESTINATIONS.cuentasPorPagar },
    ],
  },
  {
    label: "Análisis",
    items: [
      { ...DESTINATIONS.reports },
      { ...DESTINATIONS.mrr },
    ],
  },
  {
    // Nuevo grupo: habla el mismo idioma que la pantalla de permisos,
    // donde el módulo se llama literalmente "Auditoría" (ROUTE_TO_MODULE).
    label: "Auditoría",
    items: [
      { ...DESTINATIONS.activity },
      { ...DESTINATIONS.audit },
    ],
  },
  {
    // Renombrado de "Sistema": solo administración (antes mezclaba
    // auditoría y ayuda).
    label: "Administración",
    items: [
      { ...DESTINATIONS.users },
      { ...DESTINATIONS.settingsOperations },
      { ...DESTINATIONS.platform, platformOperatorOnly: true },
    ],
  },
  {
    // Ayuda + comunidad: baja frecuencia → colapsado por defecto.
    label: "Soporte",
    collapsible: true,
    defaultOpen: false,
    items: [
      { ...DESTINATIONS.help },
      { ...DESTINATIONS.changelog, badgeKey: "changelog_new" },
      { ...DESTINATIONS.misReportes },
      { ...DESTINATIONS.leaderboard },
      { ...DESTINATIONS.feedback },
    ],
  },
];

export const SEARCH_NAVIGATION_ITEMS: SearchNavigationItem[] = [
  { ...DESTINATIONS.home, group: "General" },
  { ...DESTINATIONS.calendar, group: "General", keywords: "gantt reservas" },
  { ...DESTINATIONS.crm, group: "Ventas", keywords: "prospectos pipeline comercial" },
  { ...DESTINATIONS.customers, group: "Ventas" },
  { ...DESTINATIONS.quotes, group: "Ventas" },
  { ...DESTINATIONS.bookings, group: "Operación diaria" },
  { ...DESTINATIONS.contracts, group: "Ventas" },
  { ...DESTINATIONS.deliveries, group: "Operación diaria" },
  { ...DESTINATIONS.returns, group: "Operación diaria" },
  { ...DESTINATIONS.invoices, group: "Finanzas" },
  { ...DESTINATIONS.fleet, group: "Flota", keywords: "montacargas" },
  { ...DESTINATIONS.maintenance, group: "Flota" },
  { ...DESTINATIONS.damage, group: "Flota" },
  { ...DESTINATIONS.inventory, group: "Flota" },
  { ...DESTINATIONS.suppliers, group: "Compras" },
  { ...DESTINATIONS.expenses, group: "Compras", keywords: "gastos operativos" },
  { ...DESTINATIONS.incomeStatement, group: "Finanzas" },
  { ...DESTINATIONS.reports, group: "Análisis" },
  { ...DESTINATIONS.activity, group: "Auditoría" },
  { ...DESTINATIONS.audit, group: "Auditoría", keywords: "auditoria audit trail" },
  { ...DESTINATIONS.settingsOperations, group: "Administración", keywords: "configuracion operativa" },
  { ...DESTINATIONS.settingsCompany, group: "Administración" },
  { ...DESTINATIONS.users, group: "Administración" },
  { ...DESTINATIONS.changelog, group: "Soporte" },
  { ...DESTINATIONS.help, group: "Soporte" },
];
