// Lógica de scoring del emparejamiento bancario.
// Extraída a TS para tener paridad testeable con el RPC `match_bank_statement_lines`.
//
// Fórmula:
//   monto exacto (tolerancia 0.01) → 60 pts (sin esto, score = 0)
//   cercanía de fecha (días)       → max(0, 25 - diasDif * 8)
//   referencia parcial (substring) → 15 pts

export interface ScoreInput {
  /** Monto absoluto del pago (positivo), en la moneda ORIGINAL del pago. */
  paymentAmount: number;
  /** Monto absoluto de la línea bancaria (positivo), en la moneda de la cuenta. */
  lineAmount: number;
  /** Fecha del pago YYYY-MM-DD. */
  paymentDate: string;
  /** Fecha de la línea bancaria YYYY-MM-DD. */
  lineDate: string;
  /** Referencia capturada en el pago. */
  paymentReference: string | null;
  /** Texto bruto de la línea bancaria (descripción + referencia). */
  lineText: string | null;
  /** Moneda del pago (p.ej. "USD"). Si se omite, se asume igual a la de la cuenta. */
  paymentCurrency?: string | null;
  /** Moneda de la cuenta bancaria del estado de cuenta. */
  accountCurrency?: string | null;
  /** Tipo de cambio del pago (moneda pago → moneda cuenta). */
  paymentExchangeRate?: number | string | null;
}

const AMOUNT_TOLERANCE = 0.01;
const MAX_DATE_DAYS = 3;
const DATE_POINTS = 25;
const DATE_DECAY = 8;
const REF_POINTS = 15;
const AMOUNT_POINTS = 60;

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round(Math.abs(da - db) / 86_400_000);
}

/**
 * Convierte `paymentAmount` a la moneda de la cuenta bancaria, replicando la
 * regla del RPC `get_bank_match_candidates` (Fix 6.1):
 *   v_amount = currency === accountCurrency ? amount : amount * exchange_rate
 * Si las monedas difieren y no hay exchange_rate, no matchea (no se asume
 * un TC implícito de 1:1).
 */
function convertPaymentAmount(input: ScoreInput): number | null {
  const paymentCurrency = (input.paymentCurrency ?? input.accountCurrency ?? "MXN").toUpperCase();
  const accountCurrency = (input.accountCurrency ?? paymentCurrency).toUpperCase();
  if (paymentCurrency === accountCurrency) return input.paymentAmount;
  const rate = Number(input.paymentExchangeRate ?? NaN);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return input.paymentAmount * rate;
}

export function computeMatchScore(input: ScoreInput): number {
  const convertedAmount = convertPaymentAmount(input);
  if (convertedAmount === null) return 0;
  const amountDiff = Math.abs(convertedAmount - input.lineAmount);
  if (amountDiff > AMOUNT_TOLERANCE) return 0;

  const dDiff = daysBetween(input.paymentDate, input.lineDate);
  if (dDiff > MAX_DATE_DAYS) return 0;

  let score = AMOUNT_POINTS;
  score += Math.max(0, DATE_POINTS - dDiff * DATE_DECAY);

  const ref = (input.paymentReference ?? "").trim().toLowerCase();
  const text = (input.lineText ?? "").trim().toLowerCase();
  if (ref.length > 0 && text.length > 0 && text.includes(ref)) {
    score += REF_POINTS;
  }
  return score;
}
