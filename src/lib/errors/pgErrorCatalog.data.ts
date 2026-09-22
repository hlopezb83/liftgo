/**
 * Datos estáticos del catálogo de errores de Postgres/PostgREST → mensajes
 * accionables en es-MX. La lógica de resolución vive en la fachada
 * `pgErrorCatalog.ts`; aquí solo hay mapas y arreglos, sin algoritmo.
 *
 * Niveles del catálogo:
 *   1. Nombre de la restricción (unique index, check, exclusion, FK).
 *   2. SQLSTATE estructurado (`error.code`, o el código embebido en el texto).
 *   3. Patrones de texto libre (último recurso, compatibilidad histórica).
 */

export type ErrorSeverity = "critical" | "warning";

export interface CatalogEntry {
  title?: string;
  message: string;
  severity?: ErrorSeverity;
}

// ---------------------------------------------------------------------------
// Nivel 1 — restricciones con nombre
// ---------------------------------------------------------------------------

/**
 * Mensajes por nombre de restricción. Cubre los índices únicos, las
 * restricciones de exclusión y las checks de negocio que el usuario puede
 * disparar desde la UI.
 */
export const CONSTRAINT_MESSAGES: Record<string, CatalogEntry> = {
  // --- Folios y numeración ---
  bookings_booking_number_key: { message: "Ya existe una reserva con ese número. Recarga la página para obtener el siguiente folio." },
  credit_notes_credit_note_number_key: { message: "Ya existe una nota de crédito con ese número. Recarga la página para obtener el siguiente folio." },
  deliveries_delivery_number_key: { message: "Ya existe una entrega con ese número. Recarga la página para obtener el siguiente folio." },
  return_inspections_inspection_number_key: { message: "Ya existe una inspección de devolución con ese número." },
  supplier_bills_bill_number_key: { message: "Ya existe una factura de proveedor con ese número." },
  quotes_quote_number_unique: { message: "Ya existe una cotización con ese número. Recarga la página para obtener el siguiente folio." },
  contracts_contract_number_key: { message: "Ya existe un contrato con ese número." },
  contracts_contract_number_unique_idx: { message: "Ya existe un contrato con ese número." },
  invoices_invoice_number_unique_idx: { message: "Ya existe una factura con ese número. Recarga la página para obtener el siguiente folio." },
  feedback_reports_folio_key: { message: "Ya existe un reporte con ese folio." },
  // Tramo 8 (migración 0029): el folio de recibo es propio de cada empresa.
  payments_org_rep_number_uidx: { message: "Ya existe un pago de tu empresa con ese número de recibo." },
  // Se conserva el nombre anterior mientras haya ambientes sin la migración 0029.
  payments_rep_number_uidx: { message: "Ya existe un pago con ese número de recibo." },

  // --- Datos fiscales y catálogos ---
  customers_rfc_unique: { message: "Ya existe un cliente con ese RFC." },
  // Tramo 8 (migración 0029): cada empresa tiene su propio catálogo de
  // proveedores, así que el choque siempre es con un registro propio y visible.
  suppliers_org_rfc_unique_idx: {
    message:
      "Ya tienes un proveedor con ese RFC. Búscalo en tu lista de proveedores en lugar de darlo de alta otra vez.",
  },
  // Nombre anterior (unicidad global), conservado para ambientes sin 0029.
  suppliers_rfc_unique_idx: {
    message:
      "Ese RFC de proveedor ya está registrado en el sistema. Si no lo encuentras en tu lista de proveedores, solicita apoyo al administrador: el catálogo de proveedores aún se comparte entre empresas.",
  },
  supplier_bills_cfdi_uuid_uniq: { message: "Ese CFDI ya fue registrado en otra factura de proveedor. Verifica el UUID fiscal." },
  operating_expenses_cfdi_uuid_key: { message: "Ese CFDI ya fue registrado en otro gasto operativo." },

  // --- Flota y catálogos operativos ---
  // Tramo 8 (migración 0029): flota, mecánicos, operadores y refacciones son
  // propios de cada empresa; el registro que choca siempre es visible.
  forklifts_org_serial_number_unique: {
    message: "Ya tienes un montacargas con ese número de serie. Búscalo en tu flota.",
  },
  forklifts_org_name_unique: {
    message: "Ya tienes un montacargas con ese nombre. Usa otro nombre para distinguirlos.",
  },
  mechanics_org_name_unique: {
    message: "Ya tienes un mecánico con ese nombre. Agrega un distintivo al nombre para diferenciarlos.",
  },
  drivers_org_name_unique: {
    message: "Ya tienes un operador con ese nombre. Agrega un distintivo al nombre para diferenciarlos.",
  },
  parts_inventory_org_sku_unique: {
    message: "Ya tienes una refacción con ese SKU. Búscala en tu inventario.",
  },
  // Nombres anteriores (unicidad global), conservados para ambientes sin 0029:
  // ahí el registro que choca puede pertenecer a otra empresa y no ser visible.
  forklifts_serial_number_unique: {
    message:
      "Ese número de serie ya está registrado en el sistema. Si no aparece en tu flota, solicita apoyo al administrador: el número de serie aún es único entre empresas.",
  },
  forklifts_name_unique: {
    message:
      "Ese nombre de montacargas ya está registrado en el sistema. Si no aparece en tu flota, usa otro nombre o solicita apoyo al administrador: el nombre aún es único entre empresas.",
  },
  equipment_models_mfr_model_unique: {
    message:
      "Ese fabricante y modelo ya existen en el catálogo compartido de modelos. Selecciónalo de la lista en lugar de crearlo otra vez.",
  },
  equipment_models_org_mfr_model_unique: {
    message:
      "Ese modelo ya está habilitado para tu empresa. Edita su alias o sus tarifas en la lista actual.",
  },
  equipment_models_org_catalog_unique: {
    message:
      "Ese modelo global ya está habilitado para tu empresa. Edita su configuración local en la lista actual.",
  },
  drivers_name_unique: {
    message:
      "Ese nombre de operador ya está registrado en el sistema. Si no aparece en tu lista, agrega un distintivo al nombre o solicita apoyo al administrador: el nombre aún es único entre empresas.",
  },
  mechanics_name_unique: {
    message:
      "Ese nombre de mecánico ya está registrado en el sistema. Si no aparece en tu lista, agrega un distintivo al nombre o solicita apoyo al administrador: el nombre aún es único entre empresas.",
  },
  parts_inventory_sku_unique: {
    message:
      "Ese SKU de refacción ya está registrado en el sistema. Si no aparece en tu inventario, solicita apoyo al administrador: el SKU aún es único entre empresas.",
  },
  maintenance_parts_log_part_unique: { message: "Esa refacción ya fue registrada en este mantenimiento. Edita la cantidad en lugar de agregarla otra vez." },
  maintenance_policies_forklift_id_key: { message: "Ese montacargas ya tiene una póliza de mantenimiento configurada." },

  // --- Reservas, facturación y traslapes ---
  no_overlapping_bookings: { message: "Las fechas se traslapan con otra reserva o con mantenimiento programado." },
  invoices_booking_period_uniq: { message: "Ya existe una factura para esa reserva y ese periodo." },
  uniq_invoices_recurring_period: { message: "Ya existe una factura vigente (no cancelada) para ese periodo recurrente." },
  booking_extensions_invoice_id_uniq: { message: "Esa extensión de reserva ya fue facturada." },
  uq_damage_records_invoice_id: { message: "Ese registro de daño ya tiene una factura asociada." },
  payments_invoice_installment_uidx: { message: "Ya se registró un pago para esa parcialidad de la factura." },
  unique_forklift_assignment: { message: "Ese montacargas ya está asignado a la cotización." },

  // --- Conciliación bancaria ---
  bank_statement_lines_account_hash_uq: { message: "Ese movimiento bancario ya fue importado antes. Revisa el estado de cuenta cargado." },
  bank_statement_lines_matched_payment_uq: { message: "Ese pago ya está conciliado con otro movimiento bancario." },
  bank_statement_lines_matched_supplier_payment_uq: { message: "Ese pago a proveedor ya está conciliado con otro movimiento bancario." },
  bank_accounts_one_default_collection: { message: "Ya hay una cuenta marcada como predeterminada para cobranza. Desmarca la anterior primero." },
  supplier_bank_accounts_one_primary: { message: "Ese proveedor ya tiene una cuenta bancaria principal. Desmarca la anterior primero." },
  supplier_contacts_one_primary: { message: "Ese proveedor ya tiene un contacto principal. Desmarca el anterior primero." },

  // --- CRM, usuarios y configuración ---
  // Tramo 8 (migración 0029): el orden de la etapa es propio de cada empresa.
  prospects_org_stage_order_uniq: { message: "Ese lugar en la etapa ya está ocupado. Recarga el tablero e intenta mover la tarjeta de nuevo." },
  prospects_stage_order_uniq: { message: "Ese lugar en la etapa ya está ocupado. Recarga el tablero e intenta mover la tarjeta de nuevo." },
  profiles_user_id_key: { message: "Ese usuario ya tiene un perfil creado." },
  user_roles_user_id_role_key: { message: "Ese usuario ya tiene asignado ese rol." },
  user_roles_one_role_per_user: { message: "Cada usuario puede tener un solo rol. Cambia el rol actual en lugar de agregar otro." },
  role_permissions_role_module_key: { message: "Ese permiso ya está configurado para el rol y módulo." },
  company_settings_singleton: { message: "Solo puede existir una configuración de empresa." },
  contract_templates_single_default_idx: { message: "Ya hay una plantilla de contrato predeterminada. Desmarca la anterior primero." },
  collection_reminders_log_invoice_id_reminder_type_key: { message: "Ese recordatorio de cobranza ya fue enviado para esta factura." },
  webhook_events_provider_event_unique: { message: "Ese evento ya fue procesado." },
};

// ---------------------------------------------------------------------------
// Nivel 2 — SQLSTATE
// ---------------------------------------------------------------------------

export const SQLSTATE_MESSAGES: Record<string, CatalogEntry> = {
  "23505": { message: "Ya existe un registro con esos datos." },
  "23503": { message: "No se puede completar: hay registros relacionados que dependen de este." },
  "23514": { message: "Alguno de los valores no cumple las reglas del negocio. Revisa montos, fechas y cantidades." },
  "23502": { message: "Falta un dato obligatorio. Revisa los campos marcados." },
  "23P01": { message: "Las fechas se traslapan con otra reserva o con mantenimiento programado." },
  "22P02": { message: "Uno de los datos tiene un formato inválido." },
  "22003": { message: "El monto o la cantidad está fuera del rango permitido." },
  "22001": { message: "Uno de los textos es demasiado largo. Acórtalo e intenta de nuevo." },
  "42501": { message: "No tienes permisos para esta acción.", title: "Sin permisos" },
  "40001": { message: "Otra persona guardó cambios al mismo tiempo. Intenta de nuevo.", title: "Conflicto de concurrencia" },
  "40P01": { message: "El sistema detectó un bloqueo entre dos operaciones. Intenta de nuevo.", title: "Conflicto de concurrencia" },
  PGRST116: { message: "El registro no existe o fue eliminado." },
  PGRST301: { message: "Tu sesión expiró. Inicia sesión nuevamente.", title: "Sesión expirada" },
};

/** Códigos que se consideran esperables y no ameritan un toast crítico. */
export const WARNING_SQLSTATES = new Set([
  "23505",
  "23503",
  "23514",
  "23502",
  "23P01",
  "22003",
  "22001",
  "40001",
  "40P01",
  "P0001",
  "PGRST116",
]);

// ---------------------------------------------------------------------------
// Nivel 3 — texto libre
// ---------------------------------------------------------------------------

/**
 * Mensajes de negocio que viajan dentro de un SQLSTATE genérico (típicamente
 * `23514` de un CHECK o trigger). Se evalúan ANTES del nivel 2, porque si no
 * el código genérico gana y el usuario ve "revisa montos, fechas y cantidades".
 */
export const PRIORITY_TEXT_PATTERNS: Array<{ pattern: RegExp; entry: CatalogEntry }> = [
  {
    pattern: /invoices_booking_period_required|billing_period_start|periodo de facturación/i,
    entry: {
      title: "Falta el periodo de facturación",
      message: "Las facturas ligadas a una reserva necesitan un periodo de facturación. Captura la fecha de inicio y fin del periodo e intenta de nuevo.",
      severity: "warning",
    },
  },
  {
    pattern: /entrega completada no puede reabrirse/i,
    entry: {
      title: "Entrega cerrada",
      message: "Esta entrega ya está completada y no puede reabrirse. Registra una recolección o crea una nueva entrega.",
      severity: "warning",
    },
  },
  {
    // G-C2: el guard de rol vive ahora en el trigger `validate_prospect_close`.
    pattern: /puede cerrar un prospecto como Ganado/i,
    entry: {
      title: "Acceso restringido",
      message: "Solo un administrador o administrativo puede cerrar un prospecto como Ganado.",
      severity: "warning",
    },
  },
];

export const TEXT_PATTERNS: Array<{ pattern: RegExp; entry: CatalogEntry }> = [
  { pattern: /stale_write/i, entry: { title: "Cambios no guardados", message: "Este registro fue modificado en otra pestaña o por otro usuario. Recarga los datos para ver los cambios más recientes.", severity: "warning" } },
  { pattern: /LAST_ADMIN_CANNOT_BE_DEMOTED/i, entry: { message: "No puedes cambiar el rol del último administrador. Promueve a otro usuario primero.", severity: "warning" } },
  { pattern: /LAST_ADMIN_CANNOT_BE_DELETED/i, entry: { message: "No puedes eliminar al último administrador del sistema.", severity: "warning" } },
  // M-7: ver PRIORITY_TEXT_PATTERNS (el trigger llega con 23514).

  // L-1: la BD bloquea sacar una factura de borrador sin cliente asignado.
  { pattern: /no puede salir de borrador sin cliente|invoices_customer_required_when_not_draft/i, entry: { title: "Falta el cliente", message: "Asigna un cliente a la factura antes de sacarla de borrador.", severity: "warning" } },

  { pattern: /exclusion constraint/i, entry: { message: "Las fechas se traslapan con otra reserva o con mantenimiento programado.", severity: "warning" } },
  { pattern: /duplicate key|already exists/i, entry: { message: "Ya existe un registro con esos datos.", severity: "warning" } },
  { pattern: /violates row-level security|permission denied/i, entry: { title: "Sin permisos", message: "No tienes permisos para esta acción." } },
  { pattern: /foreign key/i, entry: { message: "No se puede completar: hay registros relacionados que dependen de este.", severity: "warning" } },
  { pattern: /failed to fetch|networkerror|load failed/i, entry: { title: "Sin conexión", message: "Sin conexión. Verifica tu internet." } },
  { pattern: /jwt expired|invalid token|not authenticated/i, entry: { title: "Sesión expirada", message: "Tu sesión expiró. Inicia sesión nuevamente." } },
  { pattern: /rate limit|too many requests|\b429\b/i, entry: { message: "Demasiadas solicitudes. Intenta en unos momentos.", severity: "warning" } },
  { pattern: /not found/i, entry: { message: "El registro no existe o fue eliminado.", severity: "warning" } },
  { pattern: /overlap|ya está reservado/i, entry: { message: "El equipo ya está reservado en ese rango.", severity: "warning" } },
];
