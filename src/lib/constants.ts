import { Constants } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/domain/roles";

export const APP_ROLES = Constants.public.Enums.app_role;
export const STAFF_ROLES = APP_ROLES.filter((r): r is Exclude<AppRole, "customer"> => r !== "customer");

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  administrativo: "Administrativo",
  dispatcher: "Despachador",
  mechanic: "Mecánico",
  auditor: "Auditor",
  ventas: "Ventas",
  customer: "Cliente",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-destructive text-destructive-foreground",
  administrativo: "bg-info text-info-foreground",
  dispatcher: "bg-warning text-warning-foreground",
  mechanic: "bg-success text-success-foreground",
  auditor: "bg-chart-5 text-primary-foreground",
  ventas: "bg-chart-2 text-primary-foreground",
  customer: "bg-muted text-muted-foreground",
};

export const FORKLIFT_STATUSES = ["available", "rented", "maintenance", "retired", "sold"] as const;
export type ForkliftStatus = typeof FORKLIFT_STATUSES[number];

export const BOOKING_STATUSES = ["confirmed", "completed", "cancelled"] as const;
export type BookingStatus = typeof BOOKING_STATUSES[number];

export const FORKLIFT_STATUS = {
  available: "available",
  rented: "rented",
  maintenance: "maintenance",
  retired: "retired",
  sold: "sold",
} as const satisfies Record<ForkliftStatus, ForkliftStatus>;

export const BOOKING_STATUS = {
  confirmed: "confirmed",
  completed: "completed",
  cancelled: "cancelled",
} as const satisfies Record<BookingStatus, BookingStatus>;

export const FUEL_TYPES = ["Diesel", "Electric", "LPG"] as const;
export const SERVICE_TYPES = [
  "Inspección de Rutina", "Cambio de Aceite", "Servicio de Batería", "Reemplazo de Llantas",
  "Reparación Hidráulica", "Servicio de Frenos", "Reparación Eléctrica", "Póliza de Mantenimiento", "Otro",
] as const;
export const INSPECTION_CONDITIONS = ["good", "minor_damage", "major_damage", "needs_repair"] as const;
export const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"] as const;
export const DAMAGE_STATUSES = ["reported", "in_repair", "repaired", "invoiced"] as const;
export const MAINTENANCE_WORK_STATUSES = ["pending", "in_progress", "waiting_parts", "completed"] as const;

export const MAINTENANCE_WORK_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En Progreso",
  waiting_parts: "Esperando Refacciones",
  completed: "Completado",
};

export const FUEL_TYPE_LABELS: Record<string, string> = {
  Diesel: "Diésel",
  Electric: "Eléctrico",
  LPG: "Gas LP / Gasolina",
};

export const FUEL_LEVEL_LABELS: Record<string, string> = {
  Full: "Lleno",
  "3/4": "3/4",
  "1/2": "1/2",
  "1/4": "1/4",
  Empty: "Vacío",
};

export const STATUS_LABELS: Record<string, string> = {
  all: "Todos",
  available: "Disponible",
  rented: "Rentado",
  maintenance: "Mantenimiento",
  retired: "Retirado",
  draft: "Borrador",
  sent: "Sin Pagar",
  paid: "Pagado",
  overdue: "Vencido",
  confirmed: "Confirmado",
  accepted: "Aceptado",
  declined: "Rechazado",
  expired: "Expirado",
  completed: "Completado",
  reported: "Reportado",
  in_repair: "En Reparación",
  repaired: "Reparado",
  invoiced: "Facturado",
  good: "Bueno",
  minor_damage: "Daño Menor",
  major_damage: "Daño Mayor",
  needs_repair: "Necesita Reparación",
  active: "Activo",
  inactive: "Inactivo",
  sold: "Vendido",
  rental: "Renta",
  sale: "Venta",
  signed: "Firmado",
  cancelled: "Cancelado",
  partial: "Parcial",
  scheduled: "Programado",
  pending: "Pendiente",
  delivery: "Entrega",
  pickup: "Recolección",
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};
