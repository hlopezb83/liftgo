export const FORKLIFT_STATUSES = ["available", "rented", "maintenance", "retired"] as const;
export const FUEL_TYPES = ["Diesel", "Electric", "LPG", "Gasoline"] as const;
export const SERVICE_TYPES = [
  "Routine Inspection", "Oil Change", "Battery Service", "Tire Replacement",
  "Hydraulic Repair", "Brake Service", "Electrical Repair", "Other",
] as const;
export const INSPECTION_CONDITIONS = ["good", "minor_damage", "major_damage", "needs_repair"] as const;
export const FUEL_LEVELS = ["Full", "3/4", "1/2", "1/4", "Empty"] as const;
export const DAMAGE_STATUSES = ["reported", "in_repair", "repaired", "invoiced"] as const;
