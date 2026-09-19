import { translatePgError } from "@/lib/errors/pgErrorCatalog";
import {
  BUSINESS_BLOCKS,
  BlockCopy,
  BusinessBlock,
  BusinessBlockCode,
  CONSTRAINT_BLOCKS,
  ERROR_PATTERNS,
  FORKLIFT_TARGET_ACTIONS,
} from "./businessBlocks.data";

export type { BusinessBlockCode, BusinessBlock } from "./businessBlocks.data";

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

export { BUSINESS_BLOCKS } from "./businessBlocks.data";

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

/** Bloqueo de renta activa con el título correcto para el estado solicitado. */
export function describeForkliftRentalBlock(targetStatus: string): BusinessBlock {
  const action = FORKLIFT_TARGET_ACTIONS[targetStatus];
  return describeBusinessBlock("forklift_active_rental", action ? { action } : undefined);
}
