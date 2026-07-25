import { DashboardIcon, FleetIcon, CalendarDays, BookOpen, UsersIcon, MaintenanceIcon, InvoiceIcon, SettingsIcon, ClipboardCheck, DeliveryIcon, DocumentIcon, ActivityIcon, ChartIcon, WarnIcon, SecurityIcon, ScrollText, HistoryIcon, HelpIcon, InventoryIcon, TargetIcon, SupplierIcon, MessageSquare, TrophyIcon, Megaphone, FileClock, TrendingUpIcon, BankIcon, ArrowLeftRight, GitCompareArrows } from "@/components/icons";
import type { ElementType } from "react";

export type SidebarBadgeKey =
  | "maintenance_open"
  | "deliveries_today"
  | "returns_today"
  | "intents_pending"
  | "changelog_new";
export type NavItem = { title: string; url: string; icon: ElementType; badgeKey?: SidebarBadgeKey };
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean; defaultOpen?: boolean };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [
      { title: "Panel", url: "/", icon: DashboardIcon },
      { title: "Calendario", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    // Flujo del día a día de una rentadora: lo usa el 80% de los roles.
    // Sin colapsar y arriba — antes estaba escondido en un grupo colapsado.
    label: "Operación diaria",
    items: [
      { title: "Reservas", url: "/bookings", icon: BookOpen },
      { title: "Entregas", url: "/deliveries", icon: DeliveryIcon, badgeKey: "deliveries_today" },
      { title: "Devoluciones", url: "/returns", icon: ClipboardCheck, badgeKey: "returns_today" },
    ],
  },
  {
    label: "Ventas",
    collapsible: true,
    defaultOpen: true, // pipeline comercial: uso frecuente
    items: [
      { title: "CRM", url: "/crm", icon: TargetIcon },
      { title: "Clientes", url: "/customers", icon: UsersIcon },
      { title: "Cotizaciones", url: "/quotes", icon: DocumentIcon },
      { title: "Contratos", url: "/contracts", icon: ScrollText },
    ],
  },
  {
    label: "Flota",
    items: [
      { title: "Equipos", url: "/fleet", icon: FleetIcon },
      { title: "Mantenimiento", url: "/maintenance", icon: MaintenanceIcon, badgeKey: "maintenance_open" },
      { title: "Daños", url: "/damage", icon: WarnIcon },
      { title: "Refacciones", url: "/inventory", icon: InventoryIcon },
    ],
  },
  {
    // Renombrado de "Facturación y Finanzas": más corto y directo.
    label: "Dinero",
    collapsible: true,
    items: [
      { title: "Facturas", url: "/invoices", icon: InvoiceIcon },
      // Renombrado de "Conciliación": había DOS "Conciliación" en el mismo
      // grupo (pagos vs bancaria). Ahora son inequívocas.
      { title: "Conciliación de Pagos", url: "/invoices/reconciliation", icon: GitCompareArrows },
      { title: "Flujo de Caja", url: "/flujo-de-caja", icon: TrendingUpIcon },
      { title: "Cuentas Bancarias", url: "/cuentas-bancarias", icon: BankIcon },
      { title: "Conciliación Bancaria", url: "/conciliacion-bancaria", icon: ArrowLeftRight },
      { title: "Estado de Resultados", url: "/income-statement", icon: ChartIcon },
    ],
  },
  {
    label: "Compras",
    collapsible: true,
    items: [
      { title: "Proveedores", url: "/suppliers", icon: SupplierIcon },
      { title: "Facturas de Proveedor", url: "/cuentas-por-pagar", icon: FileClock },
    ],
  },
  {
    label: "Análisis",
    items: [
      { title: "Reportes", url: "/reports", icon: ChartIcon },
      { title: "MRR / Métricas", url: "/mrr", icon: TrendingUpIcon },
    ],
  },
  {
    // Nuevo grupo: habla el mismo idioma que la pantalla de permisos,
    // donde el módulo se llama literalmente "Auditoría" (ROUTE_TO_MODULE).
    label: "Auditoría",
    items: [
      { title: "Actividad", url: "/activity", icon: ActivityIcon },
      { title: "Bitácora", url: "/audit", icon: HistoryIcon },
    ],
  },
  {
    // Renombrado de "Sistema": solo administración (antes mezclaba
    // auditoría y ayuda).
    label: "Administración",
    items: [
      { title: "Usuarios", url: "/users", icon: SecurityIcon },
      { title: "Configuración", url: "/settings/operations", icon: SettingsIcon },
    ],
  },
  {
    // Ayuda + comunidad: baja frecuencia → colapsado por defecto.
    label: "Soporte",
    collapsible: true,
    defaultOpen: false,
    items: [
      { title: "Ayuda", url: "/help", icon: HelpIcon },
      { title: "Changelog", url: "/changelog", icon: ScrollText },
      { title: "Mis Reportes", url: "/mis-reportes", icon: MessageSquare },
      { title: "Tabla de Honor", url: "/leaderboard", icon: TrophyIcon },
      { title: "Gestión de Feedback", url: "/feedback", icon: Megaphone },
    ],
  },
];

// Items that bypass the permissions check
// v7.226.0 · E2E-N8: quitar /audit y /activity del always-visible — ahora
// se resuelven contra el módulo "Auditoría" en useRolePermissions.
export const ALWAYS_VISIBLE_ROUTES = ["/changelog", "/help", "/mis-reportes", "/leaderboard"];
