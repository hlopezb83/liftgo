import Papa from "papaparse";
import {
  buildLine,
  BankStatementLineLimitError,
  computePeriod,
  parseAmount,
  parseDateFlexible,
  signedFromChargeCredit,
  type ParsedBankLine,
  type ParseResult,
} from "./bankParseUtils";
import type { StatementProfile } from "./bankReconciliationConstants";

export type { ParsedBankLine, ParseResult };

function openingQuoteAfterPadding(content: string, index: number): number {
  let next = index;
  while (next < content.length && content[next] !== "\n" && /\s/.test(content[next])) next += 1;
  return content[next] === '"' ? next : index;
}

/** Preserve the legacy acceptance of padding before an opening CSV quote.
 * Only field-boundary padding is removed; quoted content (including doubled
 * quotes and newlines) is copied unchanged. Papa still owns CSV parsing.
 */
function normalizeQuotedFieldPadding(content: string, delimiter: string): string {
  let output = "";
  let quoted = false;
  let fieldStart = true;
  for (let i = 0; i < content.length; i += 1) {
    if (!quoted && fieldStart) {
      i = openingQuoteAfterPadding(content, i);
      fieldStart = false;
      if (content[i] === '"') quoted = true;
      output += content[i];
      if (!quoted && (content[i] === delimiter || content[i] === "\n")) fieldStart = true;
      continue;
    }
    const char = content[i];
    output += char;
    if (quoted && char === '"') {
      if (content[i + 1] === '"') output += content[++i];
      else quoted = false;
    } else if (!quoted && (char === delimiter || char === "\n")) {
      fieldStart = true;
    }
  }
  return output;
}

function parseCsvRecords(content: string, map: ColumnMap) {
  // Logical records, not physical lines. Keep references/amounts as strings:
  // bank-specific coercion and validation remain below, not in PapaParse.
  const normalized = content.replace(/\r\n?/g, "\n");
  const config = {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: "greedy" as const,
    delimitersToGuess: [",", ";"],
    transform: (value: string) => value.trim(),
  };
  const parsed = Papa.parse<string[]>(normalized, config);
  // Padding can confuse delimiter auto-detection (e.g. a semicolon file with
  // many commas inside a padded quoted description). Evaluate both supported
  // dialects with Papa, using the existing profile/date contract to disambiguate.
  const candidates = [",", ";"].map((delimiter) => {
    const compatible = normalizeQuotedFieldPadding(normalized, delimiter);
    return { compatible, delimiter };
  });
  const plausible = candidates
    .map(({ compatible, delimiter }) => Papa.parse<string[]>(compatible, { ...config, delimiter }))
    .filter((candidate) => candidate.errors.length === 0 && candidate.data.some((row) =>
      row.length >= requiredColumns(map) && row.length <= maxColumns(map)
        // parseDateFlexible intentionally accepts date/time suffixes. A dialect
        // candidate must not pass merely because a merged field starts in a date.
        && !/[,;"]/.test(row[map.date] ?? "")
        && parseDateFlexible(row[map.date] ?? "") !== null,
    ));
  if (plausible.length === 1) return plausible[0];
  if (plausible.length > 1) {
    return { ...parsed, errors: [{ type: "Delimiter", code: "UndetectableDelimiter", message: "Ambiguous delimiter", row: undefined }] };
  }
  const compatible = normalizeQuotedFieldPadding(normalized, parsed.meta.delimiter);
  return Papa.parse<string[]>(compatible, { ...config, delimiter: parsed.meta.delimiter });
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

/** Última columna que el perfil necesita: sirve para detectar filas corridas. */
function requiredColumns(map: ColumnMap): number {
  const indexes = [map.date, map.description, map.amount, map.charge, map.credit].filter(
    (i): i is number => i !== undefined,
  );
  return Math.max(...indexes) + 1;
}

/** Total de columnas del perfil, incluyendo la referencia opcional. */
function maxColumns(map: ColumnMap): number {
  const indexes = [map.date, map.description, map.amount, map.charge, map.credit, map.reference].filter(
    (i): i is number => i !== undefined,
  );
  return Math.max(...indexes) + 1;
}

function expectedColumnsMessage(minCols: number, maxCols: number): string {
  return minCols === maxCols ? `${minCols}` : `entre ${minCols} y ${maxCols}`;
}

async function parseRow(
  r: string[],
  map: ColumnMap,
  idx: number,
  minCols: number,
  maxCols: number,
): Promise<ParsedBankLine | string> {
  // R23-J: un importe con coma sin comillas ("1500,50") partía la fila y corría
  // las columnas en silencio, importando montos y fechas equivocados.
  // R24-F: también rechazamos filas con columnas de MÁS por el mismo motivo.
  if (r.length < minCols || r.length > maxCols) {
    return `Línea ${idx + 1}: se esperaban ${expectedColumnsMessage(minCols, maxCols)} columnas y llegaron ${r.length}. Revisa que los importes con coma vengan entre comillas.`;
  }
  const dateText = r[map.date] ?? "";
  const postedDate = /[,;"]/.test(dateText) ? null : parseDateFlexible(dateText);
  if (!postedDate) return `Línea ${idx + 1}: fecha inválida ("${r[map.date] ?? ""}")`;
  const description = (r[map.description] ?? "").trim();
  const signed = computeSigned(map, r);
  if (signed === null || signed === 0) return `Línea ${idx + 1}: monto inválido o cero`;
  const reference = map.reference !== undefined ? (r[map.reference] ?? "").trim() || null : null;
  return await buildLine({ postedDate, description, signedAmount: signed, reference, lineSeq: idx });
}


export async function parseBankCsv(
  content: string,
  profile: StatementProfile,
  maxLines = Number.POSITIVE_INFINITY,
): Promise<ParseResult> {
  const map = PROFILE_HEADERS[profile] ?? PROFILE_HEADERS.generico;
  if (!map) return { lines: [], errors: ["Perfil no soportado"], periodStart: null, periodEnd: null };
  const parsed = parseCsvRecords(content, map);
  const rows = parsed.data;
  const errors: string[] = [];
  const lines: ParsedBankLine[] = [];

  if (rows.length === 0) {
    return { lines, errors: ["El archivo está vacío"], periodStart: null, periodEnd: null };
  }
  // Syntax errors can merge multiple movements into a single quoted record.
  // Reject the file before hashing/import rather than accept ambiguous rows.
  if (parsed.errors.length > 0) {
    return {
      lines,
      errors: parsed.errors.map((error) =>
        error.type === "Delimiter"
          ? "No se pudo identificar el separador CSV. Usa coma o punto y coma de forma consistente."
          : `Registro ${typeof error.row === "number" ? error.row + 1 : "?"}: CSV inválido (${error.code}). Revisa las comillas y los separadores.`,
      ),
      periodStart: null,
      periodEnd: null,
    };
  }

  const minCols = requiredColumns(map);
  // R24-F: el perfil define el máximo de columnas (incluyendo la referencia
  // opcional); una fila con más campos significa que un importe con coma
  // partió la fila y corrió los datos.
  const maxCols = maxColumns(map);
  const startIdx = parseDateFlexible(rows[0][0] ?? "") ? 0 : 1;
  const movementCount = rows.length - startIdx;
  if (movementCount > maxLines) {
    throw new BankStatementLineLimitError(movementCount, maxLines);
  }
  for (let i = startIdx; i < rows.length; i++) {
    // Ignoramos celdas vacías al final (exportaciones que dejan la coma final).
    const row = [...rows[i]];
    while (row.length > maxCols && (row[row.length - 1] ?? "").trim() === "") row.pop();
    const result = await parseRow(row, map, i, minCols, maxCols);

    if (typeof result === "string") { errors.push(result); continue; }
    lines.push(result);
  }

  return { lines, errors, ...computePeriod(lines) };
}
