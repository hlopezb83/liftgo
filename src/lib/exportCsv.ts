import Papa from "papaparse";

/**
 * M-11: mitigación de inyección de fórmulas (CSV injection). Excel/Sheets
 * ejecutan celdas de texto que empiezan con `=`, `+`, `-` o `@`; prefijarlas
 * con `'` fuerza interpretación como texto literal. Sólo aplica a strings —
 * los números reales (incl. negativos) no se tocan.
 */
const FORMULA_PREFIX = /^[=+\-@]/;
export function sanitizeCsvCell(value: unknown): unknown {
  if (typeof value === "string" && FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

function sanitizeCsvRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = sanitizeCsvCell(value);
  }
  return out as T;
}

/**
 * Exporta filas a CSV usando papaparse.
 * - Agrega BOM UTF-8 para que Excel (es-MX) detecte acentos correctamente.
 * - Escapa comillas, comas y saltos de línea dentro de celdas.
 * - Neutraliza fórmulas en celdas de texto (`=`, `+`, `-`, `@`).
 * - Usa CRLF como newline (estándar Excel).
 */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
): void {
  if (rows.length === 0) return;

  const csv = Papa.unparse(rows.map(sanitizeCsvRow), { header: true, newline: "\r\n" });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  // B-5: revocar en el mismo tick del click cancela la descarga en Firefox;
  // diferir la revocación 1s da tiempo a que el navegador consuma el blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
