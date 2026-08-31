import { translatePgError } from "@/lib/errors/pgErrorCatalog";

/**
 * Catálogo de *bloqueos de negocio explicables* (fase 1).
 *
 * Un bloqueo de negocio NO es un error técnico: es una regla del ERP que el
 * backend ya impone (trigger, RPC, constraint o RLS) y que la UI debe explicar
 * con la misma jerarquía siempre:
 *
 *   1. `action`   — qué quedó bloqueado ("No puedes vender esta unidad").
 *   2. `reason`   — por qué ("La unidad sigue rentada").
 *   3. `nextStep` — qué hacer ("Primero registra la devolución…").
 *
 * Este módulo es SOLO presentación: no valida nada ni sustituye al backend,
 * que sigue siendo la autoridad final. Los mensajes crudos de Postgres/SAT se
 * siguen traduciendo en `pgErrorCatalog`; aquí únicamente se les da forma de
 * bloque explicable cuando el error corresponde a una regla conocida.
 */

export type BusinessBlockCode =
  | "forklift_active_rental"
  | "maintenance_open_damage"
  | "contract_signed_locked"
  | "invoice_stamped_locked"
  | "invoice_cancellation_pending"
  | "supplier_bill_has_payments"
  | "supplier_bill_approved"
  | "supplier_bill_rejected"
  | "supplier_bill_paid"
  | "supplier_bill_cancelled"
  | "payment_exceeds_balance"
  | "extension_already_billed"
  | "supplier_bill_pending_approval"
  | "supplier_bill_draft"
  | "supplier_payment_rep_received"
  | "payment_rep_stamped_locked"
  | "portal_payment_fully_reported"
  | "damage_not_repaired"
  | "prospect_stage_not_negotiation"
  | "quote_expired"
  | "quote_already_converted"
  | "quote_sale_assignment_incomplete"
  | "supplier_bill_self_approval"
  | "customer_outstanding_balance";

/** `info` para restricciones normales del negocio; `warning` para riesgo real. */
export type BusinessBlockTone = "info" | "warning";

export interface BusinessBlock {
  code: BusinessBlockCode;
  /** Qué quedó bloqueado, en segunda persona. */
  action: string;
  /** Por qué está bloqueado, sin jerga técnica. */
  reason: string;
  /** Siguiente paso accionable para el usuario. */
  nextStep: string;
  tone: BusinessBlockTone;
}

type BlockCopy = Omit<BusinessBlock, "code">;

export const BUSINESS_BLOCKS: Record<BusinessBlockCode, BlockCopy> = {
  forklift_active_rental: {
    action: "No puedes cambiar el estado de esta unidad",
    reason: "La unidad sigue rentada y aún no tiene registrada su devolución.",
    nextStep: "Primero registra la devolución; después podrás cambiar el estado.",
    tone: "info",
  },
  maintenance_open_damage: {
    action: "No puedes cerrar esta orden de trabajo",
    reason: "Hay un daño abierto ligado a esta orden.",
    nextStep: "Marca el daño como reparado y vuelve a cerrar la orden.",
    tone: "info",
  },
  contract_signed_locked: {
    action: "No puedes editar este contrato",
    reason: "El contrato ya está firmado y sus condiciones quedaron en firme.",
    nextStep: "Genera un contrato nuevo si necesitas cambiar las condiciones.",
    tone: "info",
  },
  invoice_stamped_locked: {
    action: "No puedes editar esta factura",
    reason: "La factura ya fue timbrada ante el SAT.",
    nextStep: "Cancela el CFDI o emite una nota de crédito para corregirla.",
    tone: "info",
  },
  invoice_cancellation_pending: {
    action: "No puedes registrar pagos en esta factura",
    reason: "Hay una cancelación solicitada y el SAT aún no responde.",
    nextStep: "Actualiza el estado ante el SAT y vuelve a intentarlo.",
    tone: "warning",
  },
  supplier_bill_has_payments: {
    action: "No puedes modificar esta factura de proveedor",
    reason: "Ya tiene pagos registrados.",
    nextStep: "Cancela los pagos si necesitas corregir el documento.",
    tone: "info",
  },
  supplier_bill_approved: {
    action: "No puedes modificar esta factura de proveedor",
    reason: "Ya fue aprobada para pago.",
    nextStep: "Usa Cancelar en lugar de editar o eliminar.",
    tone: "info",
  },
  supplier_bill_rejected: {
    action: "No puedes modificar esta factura de proveedor",
    reason: "Fue rechazada en la revisión.",
    nextStep: "Registra una factura nueva con los datos corregidos.",
    tone: "info",
  },
  supplier_bill_paid: {
    action: "No puedes modificar esta factura de proveedor",
    reason: "Ya está pagada por completo.",
    nextStep: "Revisa los pagos aplicados si algo no cuadra.",
    tone: "info",
  },
  supplier_bill_cancelled: {
    action: "No puedes modificar esta factura de proveedor",
    reason: "Ya está cancelada.",
    nextStep: "Registra una factura nueva si necesitas volver a cargarla.",
    tone: "info",
  },
  payment_exceeds_balance: {
    action: "No puedes registrar este pago",
    reason: "El monto es mayor que el saldo pendiente de la factura.",
    nextStep: "Ajusta el monto al saldo pendiente o registra el excedente aparte.",
    tone: "info",
  },
  extension_already_billed: {
    action: "No puedes facturar esta extensión",
    reason: "La extensión ya fue facturada.",
    nextStep: "Consulta la factura ligada para revisar el cobro.",
    tone: "info",
  },
  supplier_bill_pending_approval: {
    action: "No puedes registrar el pago de esta factura",
    reason: "La factura todavía está pendiente de aprobación.",
    nextStep: "Pide que se apruebe la factura y vuelve a registrar el pago.",
    tone: "info",
  },
  supplier_bill_self_approval: {
    action: "No puedes aprobar esta factura de proveedor",
    reason: "Tú la registraste y la aprobación requiere una segunda persona.",
    nextStep: "Pide a otro administrador que la revise y la apruebe.",
    tone: "info",
  },
  supplier_bill_draft: {
    action: "No puedes registrar el pago de esta factura",
    reason: "La factura del proveedor sigue en borrador.",
    nextStep: "Envía la factura a revisión o aprobación antes de pagarla.",
    tone: "info",
  },
  supplier_payment_rep_received: {
    action: "No puedes eliminar este pago",
    reason: "Ya se registró el REP fiscal que el proveedor entregó por este pago.",
    nextStep: "Revierte primero el REP recibido y después elimina el pago.",
    tone: "info",
  },
  payment_rep_stamped_locked: {
    action: "No puedes modificar el monto ni la fecha de este pago",
    reason: "El pago tiene un complemento de pago (REP) timbrado ante el SAT.",
    nextStep: "Cancela el REP si necesitas corregir el monto o la fecha.",
    tone: "info",
  },
  portal_payment_fully_reported: {
    action: "No puedes reportar otro pago de esta factura",
    reason: "El saldo pendiente ya está cubierto por los pagos que reportaste y siguen en revisión.",
    nextStep: "Espera la validación de tu reporte; te avisaremos cuando se aplique.",
    tone: "info",
  },
  damage_not_repaired: {
    action: "No puedes archivar este daño",
    reason: "El daño sigue abierto: aún no está reparado ni cobrado en una factura.",
    nextStep: "Marca el daño como reparado o genera el cobro y después archívalo.",
    tone: "info",
  },
  prospect_stage_not_negotiation: {
    action: "No puedes cerrar este prospecto como ganado",
    reason: "Sólo se puede cerrar un deal que está en etapa Negociación.",
    nextStep: "Mueve el prospecto a Negociación y vuelve a intentarlo.",
    tone: "info",
  },
  quote_expired: {
    action: "No puedes aceptar esta cotización",
    reason: "La vigencia de la cotización ya venció.",
    nextStep: "Actualiza la fecha de vigencia desde Editar y vuelve a aceptarla.",
    tone: "info",
  },
  quote_sale_assignment_incomplete: {
    action: "No puedes facturar esta cotización de venta",
    reason: "Faltan equipos del inventario por asignar en las partidas de venta.",
    nextStep: "Asigna las unidades pendientes desde la cotización y vuelve a facturar.",
    tone: "info",
  },
  quote_already_converted: {
    action: "No puedes convertir esta cotización otra vez",
    reason: "Ya existe una reserva creada a partir de esta cotización.",
    nextStep: "Consulta la reserva ligada para darle seguimiento.",
    tone: "info",
  },
  customer_outstanding_balance: {
    action: "No puedes archivar a este cliente",
    reason: "El cliente todavía tiene saldo pendiente por cobrar.",
    nextStep: "Registra los pagos o notas de crédito hasta dejar el saldo en cero y vuelve a intentarlo.",
    tone: "info",
  },
};

/** Devuelve la copia canónica del bloqueo, con overrides opcionales. */
export function describeBusinessBlock(
  code: BusinessBlockCode,
  overrides?: Partial<BlockCopy>,
): BusinessBlock {
  return { code, ...BUSINESS_BLOCKS[code], ...overrides };
}

/** Resumen de una línea para tooltips y botones deshabilitados. */
export function businessBlockSummary(block: BusinessBlock): string {
  return `${block.reason} ${block.nextStep}`;
}

/**
 * Patrones de los mensajes que el backend ya emite hoy (triggers, RPC guards y
 * constraints). Solo reconocen reglas existentes: si el backend cambia el
 * texto, el flujo degrada al toast traducido de siempre.
 */
const ERROR_PATTERNS: Array<{ pattern: RegExp; code: BusinessBlockCode }> = [
  { pattern: /renta activa|sigue rentad|completa la devoluci/i, code: "forklift_active_rental" },
  { pattern: /da(ñ|n)o abierto/i, code: "maintenance_open_damage" },
  { pattern: /contrato firmado|signed contract|contrato ya fue firmado/i, code: "contract_signed_locked" },
  { pattern: /ya fue timbrada|cfdi timbrado|factura timbrada/i, code: "invoice_stamped_locked" },
  { pattern: /cancelaci(ó|o)n en proceso|cancellation_in_progress|cancelaci(ó|o)n pendiente/i, code: "invoice_cancellation_pending" },
  { pattern: /excede el saldo|exceeds .*balance|payment_exceeds/i, code: "payment_exceeds_balance" },
  { pattern: /extensi(ó|o)n .*ya fue facturada/i, code: "extension_already_billed" },
  { pattern: /etapa Negociaci(ó|o)n/i, code: "prospect_stage_not_negotiation" },
  // Guard `trg_guard_supplier_payment_delete` (BEFORE DELETE en supplier_payments).
  { pattern: /REP fiscal recibido/i, code: "supplier_payment_rep_received" },
  { pattern: /factura de proveedor est(á|a) cancelada/i, code: "supplier_bill_cancelled" },
  // Guard `trg_guard_invoice_sale_assignment` (BEFORE INSERT en invoices).
  { pattern: /cotizaci(ó|o)n de venta tiene .*sin asignar/i, code: "quote_sale_assignment_incomplete" },
  // Guard `trg_guard_customer_archive` y RPC `soft_delete_customer`.
  { pattern: /el cliente tiene saldo pendiente/i, code: "customer_outstanding_balance" },
];


/** Restricciones con nombre que corresponden a un bloqueo explicable. */
const CONSTRAINT_BLOCKS: Record<string, BusinessBlockCode> = {
  booking_extensions_invoice_id_uniq: "extension_already_billed",
};

/**
 * Traduce un error del backend a un bloqueo de negocio conocido, o `null` si
 * no corresponde a ninguna regla catalogada (el caller mantiene su manejo
 * actual de errores). Se apoya en `translatePgError` para no duplicar la
 * extracción/normalización de errores.
 */
export function resolveBusinessBlock(error: unknown): BusinessBlock | null {
  const translated = translatePgError(error);
  const constraintCode = translated.constraint
    ? CONSTRAINT_BLOCKS[translated.constraint]
    : undefined;
  if (constraintCode) return describeBusinessBlock(constraintCode);

  const haystack = `${translated.message} ${String((error as { message?: unknown })?.message ?? "")}`;
  for (const { pattern, code } of ERROR_PATTERNS) {
    if (pattern.test(haystack)) return describeBusinessBlock(code);
  }
  return null;
}

/**
 * Título contextual del bloqueo por renta activa, según el estado destino que
 * el usuario eligió. La regla es la misma (`change_forklift_status` en el
 * backend); solo cambia cómo se nombra la acción bloqueada.
 */
const FORKLIFT_TARGET_ACTIONS: Record<string, string> = {
  sold: "No puedes vender esta unidad",
  retired: "No puedes dar de baja esta unidad",
  maintenance: "No puedes mandar esta unidad a mantenimiento",
  available: "No puedes marcar esta unidad como disponible",
};

/** Bloqueo de renta activa con el título correcto para el estado solicitado. */
export function describeForkliftRentalBlock(targetStatus: string): BusinessBlock {
  const action = FORKLIFT_TARGET_ACTIONS[targetStatus];
  return describeBusinessBlock("forklift_active_rental", action ? { action } : undefined);
}
