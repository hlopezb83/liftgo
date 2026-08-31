/**
 * Utilidades compartidas de parseo de estados de cuenta (CSV y XML).
 * DRY: un solo lugar para fechas, montos, signo y hash de deduplicación.
 */

export interface ParsedBankLine {
  posted_date: string; // YYYY-MM-DD
  description: string;
  signed_amount: number; // positivo = abono, negativo = cargo
  reference: string | null;
  line_seq: number; // indice de la linea dentro del archivo (solo referencia visual)
  hash: string;
  /**
   * A5-09: n-esima repeticion de un movimiento con contenido identico dentro
   * del archivo (1-based). Junto con el hash forma la llave de dedup
   * `(bank_account_id, hash, occurrence)`, independiente del orden del archivo.
   */
  occurrence: number;
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

/**
 * Acepta $1,234.56, (1,234.56) como negativo, espacios/NBSP y formato es-MX
 * con coma decimal ("1.500,50").
 *
 * R23-E: antes se borraban TODAS las comas, así que "1.500,50" se leía como
 * 1.5005 — corrupción silenciosa de 1000x en importaciones bancarias es-MX.
 * Ahora el ÚLTIMO separador presente manda: si es coma, es el decimal.
 */
export function parseAmount(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[\s\u00A0]/g, "").replace(/[$]/g, "");
  if (!cleaned) return null;
  const neg =
    (cleaned.startsWith("(") && cleaned.endsWith(")")) || cleaned.startsWith("-");
  let inner = cleaned.startsWith("(") && cleaned.endsWith(")") ? cleaned.slice(1, -1) : cleaned;

  const lastComma = inner.lastIndexOf(",");
  const lastDot = inner.lastIndexOf(".");
  // M22: en-US SIN decimales: "1,500" / "12,345,678" — coma(s) con exactamente
  // 3 dígitos por grupo y sin punto → separadores de miles, no decimal.
  // Sin esta regla "1,500" se leía como 1.50 (corrupción ×1000).
  // No aplica a decimales por coma: "1,50" (2 dígitos) sigue siendo 1.50.
  if (lastDot === -1 && /^-?\d{1,3}(,\d{3})+$/.test(inner)) {
    inner = inner.replace(/,/g, "");
    // 2A-5: es-MX/europeo SIN decimales: "1.500" / "12.345.678" — punto(s) con
    // exactamente 3 dígitos por grupo y sin coma → separadores de miles.
    // Sin esta regla "1.500" se leía como 1.50 (corrupción ÷1000).
    // No aplica a "1.50" (2 dígitos) ni a "1234.567" (grupo inicial >3).
  } else if (lastComma === -1 && /^-?\d{1,3}(\.\d{3})+$/.test(inner)) {
    inner = inner.replace(/\./g, "");

  } else if (lastComma > lastDot) {
    // Coma decimal (es-MX / europeo): puntos son separadores de miles.
    inner = inner.replace(/\./g, "").replace(",", ".");
  } else {
    // Punto decimal (en-US): comas son separadores de miles.
    inner = inner.replace(/,/g, "");
  }

  const num = Number(inner);
  if (!Number.isFinite(num)) return null;
  return neg ? -Math.abs(num) : num;
}


/**
 * Hash SHA-256 (Web Crypto) truncado a 20 hex chars (80 bits) — suficiente
 * para evitar colisiones prácticas incluso con decenas de miles de
 * movimientos por cuenta.
 *
 * Fix 6.2: el hash anterior era un hash de 32 bits (`h * 31 + charCode`) con
 * `Math.abs`, que colisionaba con volúmenes moderados de movimientos y
 * descartaba en silencio líneas legítimas vía el upsert con
 * `ignoreDuplicates`. SHA-256 es criptográficamente robusto contra
 * colisiones y async por naturaleza (Web Crypto no expone versión síncrona).
 */
export async function hashLine(parts: string[]): Promise<string> {
  const data = new TextEncoder().encode(parts.join("|"));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 20);
}

export async function buildLine(input: {
  postedDate: string;
  description: string;
  signedAmount: number;
  reference: string | null;
  lineSeq: number;
}): Promise<ParsedBankLine> {
  const { postedDate, description, signedAmount, reference, lineSeq } = input;
  return {
    posted_date: postedDate,
    description,
    signed_amount: signedAmount,
    reference,
    line_seq: lineSeq,
    // A5-09: el hash depende SOLO del contenido del movimiento. Antes incluia
    // `lineSeq`, asi que un archivo traslapado o con las lineas en otro orden
    // producia hashes distintos para el mismo movimiento y se insertaban
    // duplicados. Los movimientos legitimamente identicos se distinguen ahora
    // con `occurrence` (ver `assignOccurrences`), y el indice unico de la BD es
    // (bank_account_id, hash, occurrence).
    hash: await hashLine([postedDate, signedAmount.toFixed(2), reference ?? "", description.slice(0, 80)]),
    occurrence: 1,
  };
}

/**
 * A5-09: numera las repeticiones de movimientos con contenido identico dentro
 * del archivo (1-based, en el orden en que aparecen). El resultado NO depende
 * de la posicion absoluta de cada linea, solo de cuantas veces se repite el
 * mismo contenido, asi que reimportar el mismo movimiento (en otro archivo o en
 * otro orden) produce la misma llave y la BD lo descarta como duplicado.
 */
export function assignOccurrences(lines: ParsedBankLine[]): ParsedBankLine[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const next = (seen.get(l.hash) ?? 0) + 1;
    seen.set(l.hash, next);
    return { ...l, occurrence: next };
  });
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
