import {
  LayoutDashboard, Truck, CalendarDays, BookOpen, Users, Wrench, Receipt, Settings,
  ClipboardCheck, TruckIcon, FileText, Activity, BarChart3, AlertTriangle, ShieldCheck,
  ScrollText, History, HelpCircle, Package, Target, DollarSign, Handshake,
  MessageSquare, Trophy, Megaphone, FileClock, TrendingUp, Landmark, ArrowLeftRight,
} from "lucide-react";

export type NavItem = { title: string; url: string; icon: React.ElementType };
export type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [
      { title: "Panel", url: "/", icon: LayoutDashboard },
      { title: "Calendario", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Ventas",
    collapsible: true,
    items: [
      { title: "CRM", url: "/crm", icon: Target },
      { title: "Clientes", url: "/customers", icon: Users },
      { title: "Cotizaciones", url: "/quotes", icon: FileText },
      { title: "Contratos", url: "/contracts", icon: ScrollText },
    ],
  },
  {
    label: "Operaciones",
    collapsible: true,
    items: [
      { title: "Reservas", url: "/bookings", icon: BookOpen },
      { title: "Entregas", url: "/deliveries", icon: TruckIcon },
      { title: "Devoluciones", url: "/returns", icon: ClipboardCheck },
    ],
  },
  {
    label: "Compras",
    collapsible: true,
    items: [
      { title: "Proveedores", url: "/suppliers", icon: Handshake },
      { title: "Facturas de Proveedor", url: "/cuentas-por-pagar", icon: FileClock },
    ],
  },
  {
    label: "Facturación y Finanzas",
    collapsible: true,
    items: [
      { title: "Facturas", url: "/invoices", icon: Receipt },
      { title: "Flujo de Caja", url: "/flujo-de-caja", icon: TrendingUp },
      { title: "Cuentas Bancarias", url: "/cuentas-bancarias", icon: Landmark },
      { title: "Conciliación Bancaria", url: "/conciliacion-bancaria", icon: ArrowLeftRight },
      { title: "Estado de Resultados", url: "/income-statement", icon: DollarSign },
    ],
  },
  {
    label: "Flota",
    items: [
      { title: "Equipos", url: "/fleet", icon: Truck },
      { title: "Mantenimiento", url: "/maintenance", icon: Wrench },
      { title: "Daños", url: "/damage", icon: AlertTriangle },
      { title: "Refacciones", url: "/inventory", icon: Package },
    ],
  },
  {
    label: "Análisis",
    items: [
      { title: "Reportes", url: "/reports", icon: BarChart3 },
      { title: "MRR / Métricas", url: "/mrr", icon: TrendingUp },
    ],
  },
  {
    label: "Comunidad",
    items: [
      { title: "Mis Reportes", url: "/mis-reportes", icon: MessageSquare },
      { title: "Tabla de Honor", url: "/leaderboard", icon: Trophy },
      { title: "Gestión de Feedback", url: "/feedback", icon: Megaphone },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Usuarios", url: "/users", icon: ShieldCheck },
      { title: "Configuración", url: "/settings/operations", icon: Settings },
      { title: "Actividad", url: "/activity", icon: Activity },
      { title: "Bitácora", url: "/audit", icon: History },
      { title: "Changelog", url: "/changelog", icon: ScrollText },
      { title: "Ayuda", url: "/help", icon: HelpCircle },
    ],
  },
];

// Items that bypass the permissions check
export const ALWAYS_VISIBLE_ROUTES = ["/changelog", "/help", "/activity", "/audit", "/mis-reportes", "/leaderboard"];
