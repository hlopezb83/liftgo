import { formatDateTimeMty } from "@/lib/format/dateFormats";

export const TABLES = [
  { value: "all", label: "Todas las Tablas" },
  { value: "bookings", label: "Reservas" },
  { value: "invoices", label: "Facturas" },
  { value: "forklifts", label: "Montacargas" },
  { value: "customers", label: "Clientes" },
  { value: "contracts", label: "Contratos" },
  { value: "payments", label: "Pagos" },
  { value: "deliveries", label: "Entregas" },
  { value: "maintenance_logs", label: "Mantenimiento" },
  { value: "damage_records", label: "Registros de Daños" },
  { value: "quotes", label: "Cotizaciones" },
  { value: "return_inspections", label: "Inspecciones de Devolución" },
  // Oleada 1 (A-2): tablas que se veían crudas
  { value: "supplier_bills", label: "Facturas de Proveedor" },
  { value: "parts_inventory", label: "Refacciones" },
  { value: "user_roles", label: "Roles de Usuario" },
  { value: "suppliers", label: "Proveedores" },
  { value: "prospects", label: "Prospectos" },
  { value: "supplier_payment_batches", label: "Lotes de Pago a Proveedores" },
];

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Actualización",
  DELETE: "Eliminación",
};

const TABLE_LABELS: Record<string, string> = Object.fromEntries(
  TABLES.filter((t) => t.value !== "all").map((t) => [t.value, t.label])
);

const FIELD_LABELS: Record<string, string> = {
  status: "Estado", start_date: "Fecha Inicio", end_date: "Fecha Fin", customer_name: "Nombre del Cliente",
  customer_id: "Cliente", customer_contact: "Contacto del Cliente", forklift_id: "Montacargas",
  booking_id: "Reserva", contract_number: "Número de Contrato", invoice_number: "Número de Factura",
  quote_number: "Número de Cotización", total: "Total", subtotal: "Subtotal", tax_amount: "Impuesto",
  tax_rate: "Tasa de Impuesto", description: "Descripción", notes: "Notas", daily_rate: "Tarifa Diaria",
  weekly_rate: "Tarifa Semanal", monthly_rate: "Tarifa Mensual", created_at: "Fecha de Creación",
  updated_at: "Fecha de Actualización", due_date: "Fecha de Vencimiento", paid_at: "Fecha de Pago",
  issued_at: "Fecha de Emisión", scheduled_date: "Fecha Programada", performed_at: "Fecha de Realización",
  name: "Nombre", model: "Modelo", manufacturer: "Fabricante", serial_number: "Número de Serie",
  fuel_type: "Tipo de Combustible", capacity_kg: "Capacidad (kg)", mast_height_m: "Altura de Mástil (m)",
  year: "Año", address: "Dirección", phone: "Teléfono", email: "Correo Electrónico", company: "Empresa",
  rfc: "RFC", driver_name: "Nombre del Operador", driver_phone: "Teléfono del Operador",
  service_type: "Tipo de Servicio", performed_by: "Realizado por", cost: "Costo",
  estimated_cost: "Costo Estimado", actual_cost: "Costo Real", condition: "Condición",
  fuel_level: "Nivel de Combustible", hours_used: "Horas Usadas", damage_notes: "Notas de Daño",
  damage_cost: "Costo de Daño", recurring_billing: "Facturación Recurrente", deposit_amount: "Monto de Depósito",
  terms_text: "Términos", signed_at: "Fecha de Firma", signed_by: "Firmado por", amount: "Monto",
  payment_method: "Método de Pago", payment_date: "Fecha de Pago", reference_number: "Número de Referencia",
  type: "Tipo", completed_at: "Fecha de Completado", image_url: "Imagen", return_status: "Estado de Devolución",
  last_billed_date: "Última Fecha de Facturación", line_items: "Partidas", valid_until: "Válido Hasta",
  company_name: "Empresa", contact_person: "Contacto", deal_value: "Valor del Deal", stage: "Etapa",
  quote_id: "Cotización", closed_at: "Fecha de Cierre", lost_reason: "Razón de Pérdida",
  final_amount: "Monto Final", stage_order: "Orden en Etapa",
  // Oleada 1 (A-2): campos que se veían crudos
  cfdi_status: "Estado CFDI", stock_quantity: "Cantidad en Stock",
  exchange_rate: "Tipo de Cambio", payment_in_progress_at: "Pago en Proceso",
  cancellation_status: "Estado de Cancelación",
  work_order_number: "Número de OT", hours_reading: "Lectura de Horómetro",

};

export const translateField = (field: string) => FIELD_LABELS[field] || field.replace(/_/g, " ");
export const translateAction = (action: string) => ACTION_LABELS[action] || action;
export const translateTable = (table: string) => TABLE_LABELS[table] || table.replace(/_/g, " ");

export function formatTimestamp(ts: string) {
  return formatDateTimeMty(ts);
}

export const HIDDEN_DIFF_FIELDS = new Set([
  "updated_at",
  "stage_order",
  "search_vector",
]);
