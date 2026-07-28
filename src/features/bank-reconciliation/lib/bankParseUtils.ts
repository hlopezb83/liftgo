/**
 * Utilidades compartidas de parseo de estados de cuenta (CSV y XML).
 * DRY: un solo lugar para fechas, montos, signo y hash de deduplicación.
 */

export interface ParsedBankLine {
  posted_date: string; // YYYY-MM-DD
  description: string;
  signed_amount: number; // positivo = abono, negativo = cargo
  reference: string | null;
  hash: string;
}

export interface ParseResult {
  lines: ParsedBankLine[];
  errors: string[];
  periodStart: string | null;
  periodEnd: string | null;
}

const MONTHS_ES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", oct: "10", nov: "11", dic: "12",
  jan: "01", apr: "04", aug: "08", dec: "12",
};

/** Acepta YYYY-MM-DD, ISO con hora, DD/MM/YYYY, DD/MM/YY y DDMMMYYYY (01JUL2026). */
export function parseDateFlexible(value: string): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;

  // 01JUL2026 / 01-JUL-2026 / 01 JUL 2026
  m = v.match(/^(\d{1,2})[\s-]?([A-Za-zÁÉÍÓÚáéíóú]{3})[\s-]?(\d{4})$/);
  if (m) {
    const mm = MONTHS_ES[m[2].toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Acepta $1,234.56, (1,234.56) como negativo y espacios/NBSP. */
export function parseAmount(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[\s\u00A0]/g, "").replace(/[$,]/g, "");
  if (!cleaned) return null;
  const neg = cleaned.startsWith("(") && cleaned.endsWith(")");
  const inner = neg ? cleaned.slice(1, -1) : cleaned;
  const num = Number(inner);
  if (!Number.isFinite(num)) return null;
  return neg ? -Math.abs(num) : num;
}

/** Hash estable e idéntico entre CSV y XML para deduplicar reimportaciones. */
export function hashLine(parts: string[]): string {
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function buildLine(input: {
  postedDate: string;
  description: string;
  signedAmount: number;
  reference: string | null;
}): ParsedBankLine {
  const { postedDate, description, signedAmount, reference } = input;
  return {
    posted_date: postedDate,
    description,
    signed_amount: signedAmount,
    reference,
    hash: hashLine([postedDate, signedAmount.toFixed(2), reference ?? "", description.slice(0, 80)]),
  };
}

/** cargo/abono separados -> abono - |cargo|. */
export function signedFromChargeCredit(charge: number | null, credit: number | null): number {
  return (credit ?? 0) - Math.abs(charge ?? 0);
}

export function computePeriod(lines: ParsedBankLine[]): { periodStart: string | null; periodEnd: string | null } {
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  for (const l of lines) {
    if (!periodStart || l.posted_date < periodStart) periodStart = l.posted_date;
    if (!periodEnd || l.posted_date > periodEnd) periodEnd = l.posted_date;
  }
  return { periodStart, periodEnd };
}
