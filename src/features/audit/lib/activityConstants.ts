export const ENTITY_LABELS: Record<string, string> = {
  bookings: "Reservas",
  invoices: "Facturas",
  forklifts: "Montacargas",
  contracts: "Contratos",
  quotes: "Cotizaciones",
  customers: "Clientes",
  return_inspections: "Inspecciones",
  maintenance_logs: "Mantenimiento",
  damage_records: "Daños",
  deliveries: "Entregas",
  payments: "Pagos",
  operating_expenses: "Gastos (legado)",
  supplier_bills: "Cuentas por Pagar",
  supplier_payments: "Pagos a proveedores",
  supplier_bill_approvals: "Aprobaciones CxP",
  supplier_bill: "Cuentas por Pagar",
  prospects: "Prospectos",
  suppliers: "Proveedores",
};

export const ENTITY_ROUTES: Record<string, string> = {
  forklifts: "/fleet/:id",
  invoices: "/invoices/:id",
  contracts: "/contracts/:id",
  quotes: "/quotes/:id",
  customers: "/customers/:id",
  bookings: "/calendar",
  return_inspections: "/returns",
  maintenance_logs: "/maintenance",
  damage_records: "/damage",
  deliveries: "/deliveries",
  payments: "/invoices",
  operating_expenses: "/cuentas-por-pagar",
  supplier_bills: "/cuentas-por-pagar",
  supplier_payments: "/cuentas-por-pagar",
  supplier_bill_approvals: "/cuentas-por-pagar",
  supplier_bill: "/cuentas-por-pagar",
  prospects: "/crm",
  suppliers: "/suppliers",
};

export const EVENT_TYPES = ["INSERT", "UPDATE", "DELETE"] as const;

export const EVENT_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

export type RangeKey = "today" | "7d" | "30d";

export function getRange(key: RangeKey): { from: Date; to: Date; label: string } {
  const to = new Date();
  const from = new Date();
  if (key === "today") {
    from.setHours(0, 0, 0, 0);
    return { from, to, label: "Hoy" };
  }
  if (key === "7d") {
    from.setDate(from.getDate() - 7);
    return { from, to, label: "Últimos 7 días" };
  }
  from.setDate(from.getDate() - 30);
  return { from, to, label: "Últimos 30 días" };
}
