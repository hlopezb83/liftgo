import type { AppRole } from "@/hooks/useUserRole";

export const ROLE_PERMISSIONS: Record<AppRole, { label: string; access: string[]; readOnly?: string[] }> = {
  admin: {
    label: "Administrador",
    access: ["Acceso total a todos los módulos"],
  },
  administrativo: {
    label: "Administrativo",
    access: ["Facturas", "Pagos", "Contratos", "Entregas", "Configuración", "Gastos", "Proveedores"],
    readOnly: ["Dashboard", "Flota", "Reservas", "Reportes"],
  },
  ventas: {
    label: "Ventas",
    access: ["CRM / Prospectos", "Clientes", "Cotizaciones"],
    readOnly: ["Dashboard", "Calendario", "Flota", "Reservas", "Reportes"],
  },
  dispatcher: {
    label: "Despachador",
    access: ["Reservas", "Entregas", "Calendario"],
    readOnly: ["Dashboard", "Flota", "Clientes"],
  },
  mechanic: {
    label: "Mecánico",
    access: ["Mantenimiento", "Daños", "Refacciones"],
    readOnly: ["Flota"],
  },
  auditor: {
    label: "Auditor",
    access: [],
    readOnly: ["Acceso de solo lectura a todos los módulos"],
  },
  customer: {
    label: "Cliente",
    access: ["Portal de Clientes"],
  },
};
