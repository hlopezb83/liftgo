export const FORKLIFT_STATUSES = ["available", "rented", "maintenance", "retired"] as const;
export const FUEL_TYPES = ["Diesel", "Electric", "LPG", "Gasoline"] as const;
export const SERVICE_TYPES = [
  "Inspección de Rutina", "Cambio de Aceite", "Servicio de Batería", "Reemplazo de Llantas",
  "Reparación Hidráulica", "Servicio de Frenos", "Reparación Eléctrica", "Otro",
] as const;
export const INSPECTION_CONDITIONS = ["good", "minor_damage", "major_damage", "needs_repair"] as const;
export const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"] as const;
export const DAMAGE_STATUSES = ["reported", "in_repair", "repaired", "invoiced"] as const;

export const STATUS_LABELS: Record<string, string> = {
  all: "Todos",
  available: "Disponible",
  rented: "Rentado",
  maintenance: "Mantenimiento",
  retired: "Retirado",
  draft: "Borrador",
  sent: "Enviado",
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
  signed: "Firmado",
  cancelled: "Cancelado",
  partial: "Parcial",
  scheduled: "Programado",
  pending: "Pendiente",
  delivery: "Entrega",
  pickup: "Recolección",
};
