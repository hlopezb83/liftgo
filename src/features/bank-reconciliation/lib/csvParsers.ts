import type { CsvProfile } from "./bankReconciliationConstants";

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

const SEP_RE = /[,;]\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/;

function splitCsv(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const fields = trimmed.split(SEP_RE).map((f) => f.replace(/^"|"$/g, "").trim());
    rows.push(fields);
  }
  return rows;
}

function parseDateFlexible(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // YYYY-MM-DD
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // DD/MM/YY
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function parseAmount(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/\s/g, "").replace(/[$,]/g, "");
  // Handle parentheses for negatives
  const neg = cleaned.startsWith("(") && cleaned.endsWith(")");
  const inner = neg ? cleaned.slice(1, -1) : cleaned;
  const num = Number(inner);
  if (!Number.isFinite(num)) return null;
  return neg ? -Math.abs(num) : num;
}

interface ColumnMap {
  date: number;
  description: number;
  amount?: number;
  charge?: number;
  credit?: number;
  reference?: number;
}

const PROFILE_HEADERS: Record<CsvProfile, ColumnMap | null> = {
  generico: { date: 0, description: 1, amount: 2, reference: 3 },
  bbva: { date: 0, description: 1, charge: 2, credit: 3, reference: 4 },
  banorte: { date: 0, description: 1, charge: 2, credit: 3, reference: 4 },
  santander: { date: 0, description: 1, amount: 2, reference: 3 },
};

function hashLine(parts: string[]): string {
  let h = 0;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export function parseBankCsv(content: string, profile: CsvProfile): ParseResult {
  const rows = splitCsv(content);
  const errors: string[] = [];
  const lines: ParsedBankLine[] = [];

  if (rows.length === 0) {
    return { lines, errors: ["El archivo está vacío"], periodStart: null, periodEnd: null };
  }

  const map = PROFILE_HEADERS[profile] ?? PROFILE_HEADERS.generico;
  if (!map) return { lines, errors: ["Perfil no soportado"], periodStart: null, periodEnd: null };

  // Skip header row if first cell isn't a date
  const startIdx = parseDateFlexible(rows[0][0] ?? "") ? 0 : 1;

  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    const dateStr = parseDateFlexible(r[map.date] ?? "");
    if (!dateStr) {
      errors.push(`Línea ${i + 1}: fecha inválida ("${r[map.date] ?? ""}")`);
      continue;
    }
    const description = (r[map.description] ?? "").trim();
    let signed: number | null = null;
    if (map.amount !== undefined) {
      signed = parseAmount(r[map.amount] ?? "");
    } else if (map.charge !== undefined && map.credit !== undefined) {
      const charge = parseAmount(r[map.charge] ?? "") ?? 0;
      const credit = parseAmount(r[map.credit] ?? "") ?? 0;
      signed = credit - Math.abs(charge);
    }
    if (signed === null || signed === 0) {
      errors.push(`Línea ${i + 1}: monto inválido o cero`);
      continue;
    }
    const reference = map.reference !== undefined ? (r[map.reference] ?? "").trim() || null : null;
    const hash = hashLine([dateStr, signed.toFixed(2), reference ?? "", description.slice(0, 80)]);
    lines.push({ posted_date: dateStr, description, signed_amount: signed, reference, hash });
    if (!periodStart || dateStr < periodStart) periodStart = dateStr;
    if (!periodEnd || dateStr > periodEnd) periodEnd = dateStr;
  }

  return { lines, errors, periodStart, periodEnd };
}
