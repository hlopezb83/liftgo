// Maps for translating activity feed data (covers historical English records)

const EVENT_TYPE_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  forklifts: "Montacargas",
  bookings: "Reservas",
  invoices: "Facturas",
  return_inspections: "Inspecciones de Devolución",
  maintenance_logs: "Mantenimiento",
  contracts: "Contratos",
  customers: "Clientes",
  deliveries: "Entregas",
  damage_records: "Registros de Daños",
  quotes: "Cotizaciones",
  payments: "Pagos",
};

/** Translate an activity title, handling both English and Spanish originals */
export function translateActivityTitle(title: string, eventType: string, entityType: string): string {
  // If already in Spanish (new trigger), return as-is
  if (!title.startsWith("INSERT") && !title.startsWith("UPDATE") && !title.startsWith("DELETE")) {
    return title;
  }
  const action = EVENT_TYPE_LABELS[eventType] || eventType;
  const entity = ENTITY_TYPE_LABELS[entityType] || entityType;
  return `${action} de ${entity}`;
}

/** Translate an activity description, handling both English and Spanish originals */
export function translateActivityDescription(description: string | null, eventType: string, entityType: string): string {
  if (!description) return "";
  // If already in Spanish, return as-is
  if (!description.startsWith("A ") && !description.startsWith("a ")) {
    return description;
  }
  const entity = ENTITY_TYPE_LABELS[entityType] || entityType;
  switch (eventType) {
    case "INSERT": return `Se creó un registro de ${entity}`;
    case "UPDATE": return `Se actualizó un registro de ${entity}`;
    case "DELETE": return `Se eliminó un registro de ${entity}`;
    default: return description;
  }
}
