import {
  LayoutDashboard, Truck, CalendarDays, BookOpen, Users, Wrench, Receipt, Settings,
  ClipboardCheck, TruckIcon, FileText, Activity, BarChart3, AlertTriangle, ShieldCheck,
  ScrollText, History, HelpCircle, Package, Target, DollarSign, Handshake,
  MessageSquare, Trophy, Megaphone, FileClock,
} from "lucide-react";

export type NavItem = { title: string; url: string; icon: React.ElementType };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "General",
    items: [
      { title: "Panel", url: "/", icon: LayoutDashboard },
      { title: "Calendario", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Comercial",
    items: [
      { title: "CRM", url: "/crm", icon: Target },
      { title: "Clientes", url: "/customers", icon: Users },
      { title: "Cotizaciones", url: "/quotes", icon: FileText },
      { title: "Reservas", url: "/bookings", icon: BookOpen },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { title: "Contratos", url: "/contracts", icon: ScrollText },
      { title: "Entregas", url: "/deliveries", icon: TruckIcon },
      { title: "Devoluciones", url: "/returns", icon: ClipboardCheck },
      { title: "Facturas", url: "/invoices", icon: Receipt },
    ],
  },
  {
    label: "Flota y Mantenimiento",
    items: [
      { title: "Equipos", url: "/fleet", icon: Truck },
      { title: "Mantenimiento", url: "/maintenance", icon: Wrench },
      { title: "Daños", url: "/damage", icon: AlertTriangle },
      { title: "Refacciones", url: "/inventory", icon: Package },
    ],
  },
  {
    label: "Administración",
    items: [
      { title: "Proveedores", url: "/suppliers", icon: Handshake },
      { title: "Cuentas por Pagar", url: "/cuentas-por-pagar", icon: FileClock },
      { title: "Estado de Resultados", url: "/income-statement", icon: DollarSign },
      { title: "Reportes", url: "/reports", icon: BarChart3 },
      { title: "Actividad", url: "/activity", icon: Activity },
      { title: "Bitácora", url: "/audit", icon: History },
      { title: "Configuración", url: "/settings/operations", icon: Settings },
      { title: "Usuarios", url: "/users", icon: ShieldCheck },
      { title: "Changelog", url: "/changelog", icon: ScrollText },
      { title: "Ayuda", url: "/help", icon: HelpCircle },
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
];

// Items that bypass the permissions check
export const ALWAYS_VISIBLE_ROUTES = ["/changelog", "/help", "/activity", "/audit", "/mis-reportes", "/leaderboard"];
