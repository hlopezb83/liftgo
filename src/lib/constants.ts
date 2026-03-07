import { Constants } from "@/integrations/supabase/types";
import type { AppRole } from "@/hooks/useUserRole";

export const APP_ROLES = Constants.public.Enums.app_role;
export const STAFF_ROLES = APP_ROLES.filter((r): r is Exclude<AppRole, "customer"> => r !== "customer");

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  administrativo: "Administrativo",
  dispatcher: "Despachador",
  mechanic: "Mecánico",
  auditor: "Auditor",
  customer: "Cliente",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: "bg-red-600 text-white",
  administrativo: "bg-blue-600 text-white",
  dispatcher: "bg-amber-500 text-white",
  mechanic: "bg-emerald-600 text-white",
  auditor: "bg-purple-600 text-white",
  customer: "bg-gray-500 text-white",
};

export const FORKLIFT_STATUSES = ["available", "rented", "maintenance", "retired", "sold"] as const;
export const FUEL_TYPES = ["Diesel", "Electric", "LPG"] as const;
export const SERVICE_TYPES = [
  "Inspección de Rutina", "Cambio de Aceite", "Servicio de Batería", "Reemplazo de Llantas",
  "Reparación Hidráulica", "Servicio de Frenos", "Reparación Eléctrica", "Otro",
] as const;
export const INSPECTION_CONDITIONS = ["good", "minor_damage", "major_damage", "needs_repair"] as const;
export const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"] as const;
export const DAMAGE_STATUSES = ["reported", "in_repair", "repaired", "invoiced"] as const;

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
