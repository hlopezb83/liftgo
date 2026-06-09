// Lógica de scoring del emparejamiento bancario.
// Extraída a TS para tener paridad testeable con el RPC `match_bank_statement_lines`.
//
// Fórmula:
//   monto exacto (tolerancia 0.01) → 60 pts (sin esto, score = 0)
//   cercanía de fecha (días)       → max(0, 25 - diasDif * 8)
//   referencia parcial (substring) → 15 pts

export interface ScoreInput {
  /** Monto absoluto del pago (positivo). */
  paymentAmount: number;
  /** Monto absoluto de la línea bancaria (positivo). */
  lineAmount: number;
  /** Fecha del pago YYYY-MM-DD. */
  paymentDate: string;
  /** Fecha de la línea bancaria YYYY-MM-DD. */
  lineDate: string;
  /** Referencia capturada en el pago. */
  paymentReference: string | null;
  /** Texto bruto de la línea bancaria (descripción + referencia). */
  lineText: string | null;
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

export function computeMatchScore(input: ScoreInput): number {
  const amountDiff = Math.abs(input.paymentAmount - input.lineAmount);
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
