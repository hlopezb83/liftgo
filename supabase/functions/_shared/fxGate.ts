// R9-02: gate canónico de tipo de cambio previo al timbrado.
//
// Regla (espejo Deno de `isFxMissing` en
// src/features/cash-flow/lib/cashFlowTransformers.ts, misma semántica que ya
// rige CxP/Cash-Flow/Portal en el frontend — ver R7-08/R8-11/R9-08 en el
// changelog): si la moneda normalizada (default "MXN") es distinta de MXN,
// se exige un tipo de cambio numérico, finito, > 0 y DISTINTO de 1. TC = 1 en
// moneda foránea es el default del formulario/parser CFDI, no un tipo de
// cambio realmente capturado, así que se trata como faltante. MXN siempre es
// válida y su tipo de cambio efectivo es 1.
//
// Nota de auditoría: hoy NO existe en el producto ningún override
// explícito/auditable para saltarse este gate (p. ej. "permitir TC=1 en
// moneda foránea por decisión de un admin, con bitácora"). Si algún día se
// requiere, debe modelarse como un campo explícito y auditable (quién, cuándo,
// por qué) — NO se agrega aquí ninguna puerta trasera implícita.

/** Normaliza la moneda igual que el resto de los módulos: default MXN, mayúsculas. */
export function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? "MXN").toUpperCase().trim() || "MXN";
}

/**
 * true si la factura/documento en `currency` necesita un tipo de cambio
 * capturado y no lo tiene (o el capturado no es válido para timbrar).
 */
export function isFxMissingForStamping(
  currency: string | null | undefined,
  rate: number | string | null | undefined,
): boolean {
  const code = normalizeCurrency(currency);
  if (code === "MXN") return false;
  const n = typeof rate === "string" ? Number(rate) : rate;
  const numericRate = typeof n === "number" ? n : Number(n ?? NaN);
  // TC = 1 en moneda foránea es el default no capturado (R7-08) → faltante.
  if (numericRate === 1) return true;
  return !(Number.isFinite(numericRate) && numericRate > 0);
}

/**
 * Tipo de cambio efectivo a usar en el payload del PAC: 1 para MXN, o el
 * valor capturado para moneda foránea (asumiendo que ya pasó el gate).
 */
export function effectiveStampExchange(
  currency: string | null | undefined,
  rate: number | string | null | undefined,
): number {
  const code = normalizeCurrency(currency);
  if (code === "MXN") return 1;
  const n = typeof rate === "string" ? Number(rate) : rate;
  return typeof n === "number" ? n : Number(n ?? NaN);
}

export interface FxGateResult {
  ok: boolean;
  /** Mensaje en español, listo para mostrar al operador, cuando ok=false. */
  message?: string;
  /** Moneda normalizada. */
  currency: string;
  /** Tipo de cambio efectivo a enviar al PAC (solo válido cuando ok=true). */
  exchange: number;
}

/**
 * Evalúa el gate y devuelve un resultado estructurado (sin lanzar). Útil
 * cuando el llamador necesita decidir cómo liberar un claim antes de
 * responder al cliente.
 */
export function checkStampFx(
  currency: string | null | undefined,
  rate: number | string | null | undefined,
): FxGateResult {
  const code = normalizeCurrency(currency);
  if (isFxMissingForStamping(code, rate)) {
    return {
      ok: false,
      currency: code,
      exchange: NaN,
      message:
        `La factura está en ${code} pero no tiene un tipo de cambio válido. ` +
        `Captura un tipo de cambio numérico mayor a 0 y distinto de 1 antes de timbrar.`,
    };
  }
  return { ok: true, currency: code, exchange: effectiveStampExchange(code, rate) };
}

/**
 * Variante que lanza. El mensaje del `Error` es el mismo que devuelve
 * `checkStampFx` — en español, listo para propagar como error de validación.
 */
export function assertStampFxOrThrow(
  currency: string | null | undefined,
  rate: number | string | null | undefined,
): { currency: string; exchange: number } {
  const result = checkStampFx(currency, rate);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return { currency: result.currency, exchange: result.exchange };
}
