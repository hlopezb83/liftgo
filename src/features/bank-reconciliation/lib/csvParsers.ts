import {
  buildLine,
  computePeriod,
  parseAmount,
  parseDateFlexible,
  signedFromChargeCredit,
  type ParsedBankLine,
  type ParseResult,
} from "./bankParseUtils";
import type { StatementProfile } from "./bankReconciliationConstants";

export type { ParsedBankLine, ParseResult };

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

interface ColumnMap {
  date: number;
  description: number;
  amount?: number;
  charge?: number;
  credit?: number;
  reference?: number;
}

const PROFILE_HEADERS: Record<StatementProfile, ColumnMap | null> = {
  generico: { date: 0, description: 1, amount: 2, reference: 3 },
  bbva: { date: 0, description: 1, charge: 2, credit: 3, reference: 4 },
  banorte: { date: 0, description: 1, charge: 2, credit: 3, reference: 4 },
  santander: { date: 0, description: 1, amount: 2, reference: 3 },
  bbva_xml: null,
};

function computeSigned(map: ColumnMap, r: string[]): number | null {
  if (map.amount !== undefined) return parseAmount(r[map.amount] ?? "");
  if (map.charge !== undefined && map.credit !== undefined) {
    return signedFromChargeCredit(parseAmount(r[map.charge] ?? "") ?? 0, parseAmount(r[map.credit] ?? "") ?? 0);
  }
  return null;
}

function parseRow(r: string[], map: ColumnMap, idx: number): ParsedBankLine | string {
  const postedDate = parseDateFlexible(r[map.date] ?? "");
  if (!postedDate) return `Línea ${idx + 1}: fecha inválida ("${r[map.date] ?? ""}")`;
  const description = (r[map.description] ?? "").trim();
  const signed = computeSigned(map, r);
  if (signed === null || signed === 0) return `Línea ${idx + 1}: monto inválido o cero`;
  const reference = map.reference !== undefined ? (r[map.reference] ?? "").trim() || null : null;
  return buildLine({ postedDate, description, signedAmount: signed, reference });
}

export function parseBankCsv(content: string, profile: StatementProfile): ParseResult {
  const rows = splitCsv(content);
  const errors: string[] = [];
  const lines: ParsedBankLine[] = [];

  if (rows.length === 0) {
    return { lines, errors: ["El archivo está vacío"], periodStart: null, periodEnd: null };
  }
  const map = PROFILE_HEADERS[profile] ?? PROFILE_HEADERS.generico;
  if (!map) return { lines, errors: ["Perfil no soportado"], periodStart: null, periodEnd: null };

  const startIdx = parseDateFlexible(rows[0][0] ?? "") ? 0 : 1;
  for (let i = startIdx; i < rows.length; i++) {
    const result = parseRow(rows[i], map, i);
    if (typeof result === "string") { errors.push(result); continue; }
    lines.push(result);
  }

  return { lines, errors, ...computePeriod(lines) };
}
