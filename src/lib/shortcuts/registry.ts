// Catálogo central de atajos de teclado. Fuente de verdad para el
// dialogo de ayuda y para los handlers globales en MainLayout.

export type ShortcutGroup = "global" | "navigation" | "page";

export interface ShortcutDef {
  /** Texto del combo, p.ej. "Ctrl+K" o "g d" */
  keys: string;
  description: string;
  group: ShortcutGroup;
}

export interface NavShortcut {
  /** Segunda tecla tras "g" */
  key: string;
  url: string;
  label: string;
}

/** Mapa de navegación "g + letra". Mantener letras únicas. */
export const NAV_SHORTCUTS: NavShortcut[] = [
  { key: "d", url: "/", label: "Panel" },
  { key: "k", url: "/calendar", label: "Calendario" },
  { key: "c", url: "/customers", label: "Clientes" },
  { key: "q", url: "/quotes", label: "Cotizaciones" },
  { key: "b", url: "/bookings", label: "Reservas" },
  { key: "f", url: "/invoices", label: "Facturas" },
  { key: "e", url: "/fleet", label: "Equipos" },
  { key: "m", url: "/maintenance", label: "Mantenimiento" },
  { key: "p", url: "/suppliers", label: "Proveedores" },
  { key: "x", url: "/expenses", label: "Gastos" },
  { key: "a", url: "/accounts-payable", label: "Facturas de Proveedor" },
  { key: "r", url: "/reports", label: "Reportes" },
  { key: "s", url: "/crm", label: "CRM" },
];

export const GLOBAL_SHORTCUTS: ShortcutDef[] = [
  { keys: "Ctrl+K", description: "Búsqueda y navegación", group: "global" },
  { keys: "?", description: "Mostrar atajos de teclado", group: "global" },
  { keys: "/", description: "Enfocar barra de búsqueda", group: "global" },
  { keys: "Ctrl+Shift+N", description: "Acción nuevo (página actual)", group: "global" },
  { keys: "Esc", description: "Cerrar diálogo o panel", group: "global" },
];

export const PAGE_SHORTCUTS: ShortcutDef[] = [
  { keys: "N", description: "Nuevo registro", group: "page" },
  { keys: "R", description: "Refrescar listado", group: "page" },
];
