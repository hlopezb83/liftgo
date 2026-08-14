/**
 * Máquinas de estado del dominio — espejo en TypeScript de los triggers de la
 * base de datos (`public.validate_transition` y
 * `public.enforce_signed_contract_lock`, migraciones del 10-ago-2026 m13–m18).
 *
 * Por qué existe: la verdad la impone la DB (un trigger no se puede saltar
 * desde el cliente), pero la UI necesita saber qué botones ofrecer, y los
 * tests de este archivo son el candado que detecta cuando la DB y la app se
 * desincronizan. Si cambias una whitelist aquí, cambia también la migración
 * correspondiente (y al revés).
 *
 * Fuentes:
 * - 20260810130500_baja_deliveries_maquina_estados.sql (invoices, quotes,
 *   bookings, supplier_bills, forklifts, deliveries)
 * - 20260810130700_baja_contracts_maquina_estados.sql (contracts)
 */

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partial"
  | "overdue"
  | "paid"
  | "cancelled";

export type DeliveryStatus = "pending" | "scheduled" | "completed" | "cancelled";

export type ContractStatus =
  | "draft"
  | "sent"
  | "signed"
  | "active"
  | "completed"
  | "cancelled";

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "partial",
  "overdue",
  "paid",
  "cancelled",
] as const;

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "pending",
  "scheduled",
  "completed",
  "cancelled",
] as const;

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  "draft",
  "sent",
  "signed",
  "active",
  "completed",
  "cancelled",
] as const;

/** Estados aceptados en el INSERT (v_initial del trigger). */
export const INVOICE_INITIAL_STATUSES: readonly InvoiceStatus[] = ["draft", "sent"];
export const DELIVERY_INITIAL_STATUSES: readonly DeliveryStatus[] = [
  "scheduled",
  "pending",
  // DeliveryFormDialog registra entregas "ya hechas".
  "completed",
];

/** contracts no pasa por validate_transition: su INSERT no está restringido. */
export const CONTRACT_INITIAL_STATUSES: readonly ContractStatus[] = CONTRACT_STATUSES;

export const INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  // Sprint 4 (Fix 4.2): un borrador no puede vencerse; primero debe enviarse.
  draft: ["sent", "cancelled"],
  sent: ["overdue", "paid", "cancelled"],
  overdue: ["paid", "cancelled"],
  partial: ["overdue", "cancelled"],
  paid: [],
  cancelled: [],
};

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, readonly DeliveryStatus[]> = {
  pending: ["scheduled", "completed", "cancelled"],
  scheduled: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * contracts: `signed`, `active`, `completed` y `cancelled` están bloqueados por
 * el trigger. Desde draft/sent el flujo es libre (la UI decide).
 */
export const CONTRACT_LOCKED_STATUSES: readonly ContractStatus[] = [
  "signed",
  "active",
  "completed",
  "cancelled",
];

export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ["sent", "signed", "active", "completed", "cancelled"],
  sent: ["draft", "signed", "active", "completed", "cancelled"],
  signed: ["completed", "cancelled"],
  active: ["completed", "cancelled"],
  // Sprint 4 (Fix 4.1): `completed` es terminal (espejo del trigger).
  completed: [],
  cancelled: [],
};


/** Campos que un contrato firmado/activo/cancelado ya no puede editar. */
export const CONTRACT_FROZEN_FIELDS = [
  "daily_rate",
  "weekly_rate",
  "monthly_rate",
  "deposit_amount",
  "start_date",
  "end_date",
  "terms_text",
  "extra_hour_rate",
  "max_hours_per_month",
] as const;

export type ContractFrozenField = (typeof CONTRACT_FROZEN_FIELDS)[number];

export interface InvoiceTransitionOptions {
  /**
   * `true` cuando el cambio lo ejecuta el flujo fiscal (SAT) o `service_role`:
   * el trigger permite paid → cancelled solo en ese caso.
   */
  readonly satFlow?: boolean;
  /**
   * `true` durante la sincronización de pagos (`app.payment_sync = on`), que
   * permite moverse libremente entre sent/partial/overdue/paid.
   */
  readonly paymentSync?: boolean;
}

const PAYMENT_SYNC_STATUSES: readonly InvoiceStatus[] = ["sent", "partial", "overdue", "paid"];

export function canTransitionInvoice(
  from: InvoiceStatus,
  to: InvoiceStatus,
  options: InvoiceTransitionOptions = {},
): boolean {
  if (from === to) return true; // el trigger ignora updates sin cambio de status.
  if (
    options.paymentSync &&
    PAYMENT_SYNC_STATUSES.includes(from) &&
    PAYMENT_SYNC_STATUSES.includes(to)
  ) {
    return true;
  }
  if (options.satFlow && from === "paid" && to === "cancelled") return true;
  return INVOICE_TRANSITIONS[from].includes(to);
}

export function canTransitionDelivery(from: DeliveryStatus, to: DeliveryStatus): boolean {
  if (from === to) return true;
  return DELIVERY_TRANSITIONS[from].includes(to);
}

export interface ContractTransitionOptions {
  /** El trigger exige rol admin para mover un contrato firmado/activo. */
  readonly isAdmin?: boolean;
}

export function canTransitionContract(
  from: ContractStatus,
  to: ContractStatus,
  options: ContractTransitionOptions = {},
): boolean {
  if (from === to) return true;
  if (CONTRACT_LOCKED_STATUSES.includes(from) && !options.isAdmin) return false;
  return CONTRACT_TRANSITIONS[from].includes(to);
}

/** ¿Este contrato tiene los campos económicos congelados? */
export function isContractFrozen(status: ContractStatus): boolean {
  return CONTRACT_LOCKED_STATUSES.includes(status);
}

export function canEditContractField(status: ContractStatus, field: string): boolean {
  if (!isContractFrozen(status)) return true;
  return !(CONTRACT_FROZEN_FIELDS as readonly string[]).includes(field);
}

export function isValidInitialInvoiceStatus(status: InvoiceStatus): boolean {
  return INVOICE_INITIAL_STATUSES.includes(status);
}

export function isValidInitialDeliveryStatus(status: DeliveryStatus): boolean {
  return DELIVERY_INITIAL_STATUSES.includes(status);
}
