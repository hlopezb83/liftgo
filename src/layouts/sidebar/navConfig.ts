import { DashboardIcon, FleetIcon, CalendarDays, BookOpen, UsersIcon, MaintenanceIcon, InvoiceIcon, SettingsIcon, ClipboardCheck, DeliveryIcon, DocumentIcon, ActivityIcon, ChartIcon, WarnIcon, SecurityIcon, ScrollText, HistoryIcon, HelpIcon, InventoryIcon, TargetIcon, SupplierIcon, MessageSquare, TrophyIcon, Megaphone, FileClock, TrendingUpIcon, BankIcon, ArrowLeftRight, GitCompareArrows } from "@/components/icons";
import type { ElementType } from "react";

export type NavItem = { title: string; url: string; icon: ElementType };
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [
      { title: "Panel", url: "/", icon: DashboardIcon },
      { title: "Calendario", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Ventas",
    collapsible: true,
    items: [
      { title: "CRM", url: "/crm", icon: TargetIcon },
      { title: "Clientes", url: "/customers", icon: UsersIcon },
      { title: "Cotizaciones", url: "/quotes", icon: DocumentIcon },
      { title: "Contratos", url: "/contracts", icon: ScrollText },
    ],
  },
  {
    label: "Operaciones",
    collapsible: true,
    items: [
      { title: "Reservas", url: "/bookings", icon: BookOpen },
      { title: "Entregas", url: "/deliveries", icon: DeliveryIcon },
      { title: "Devoluciones", url: "/returns", icon: ClipboardCheck },
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
    label: "Facturación y Finanzas",
    collapsible: true,
    items: [
      { title: "Facturas", url: "/invoices", icon: InvoiceIcon },
      { title: "Conciliación", url: "/invoices/reconciliation", icon: GitCompareArrows },
      { title: "Flujo de Caja", url: "/flujo-de-caja", icon: TrendingUpIcon },
      { title: "Cuentas Bancarias", url: "/cuentas-bancarias", icon: BankIcon },
      { title: "Conciliación Bancaria", url: "/conciliacion-bancaria", icon: ArrowLeftRight },
      { title: "Estado de Resultados", url: "/income-statement", icon: ChartIcon },
    ],
  },
  {
    label: "Flota",
    items: [
      { title: "Equipos", url: "/fleet", icon: FleetIcon },
      { title: "Mantenimiento", url: "/maintenance", icon: MaintenanceIcon },
      { title: "Daños", url: "/damage", icon: WarnIcon },
      { title: "Refacciones", url: "/inventory", icon: InventoryIcon },
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
    label: "Comunidad",
    items: [
      { title: "Mis Reportes", url: "/mis-reportes", icon: MessageSquare },
      { title: "Tabla de Honor", url: "/leaderboard", icon: TrophyIcon },
      { title: "Gestión de Feedback", url: "/feedback", icon: Megaphone },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Usuarios", url: "/users", icon: SecurityIcon },
      { title: "Configuración", url: "/settings/operations", icon: SettingsIcon },
      { title: "Actividad", url: "/activity", icon: ActivityIcon },
      { title: "Bitácora", url: "/audit", icon: HistoryIcon },
      { title: "Changelog", url: "/changelog", icon: ScrollText },
      { title: "Ayuda", url: "/help", icon: HelpIcon },
    ],
  },
];

// Items that bypass the permissions check
export const ALWAYS_VISIBLE_ROUTES = ["/changelog", "/help", "/activity", "/audit", "/mis-reportes", "/leaderboard"];
