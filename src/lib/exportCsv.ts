import Papa from "papaparse";

/**
 * M-11: mitigación de inyección de fórmulas (CSV injection). Excel/Sheets
 * ejecutan celdas de texto que empiezan con `=`, `+`, `-` o `@`; prefijarlas
 * con `'` fuerza interpretación como texto literal. Sólo aplica a strings —
 * los números reales (incl. negativos) no se tocan.
 * G-A6: se ignora el espacio/tab/salto de línea inicial (Excel también evalúa
 * `\t=1+1`) y los encabezados también se sanean, porque en varios reportes las
 * columnas se generan a partir de datos capturados por el usuario.
 * Se usa comparación de caracteres (no regex) porque ESLint prohíbe rangos de
 * control (`-`) en expresiones regulares (`no-control-regex`).
 */
const FORMULA_CHARS = new Set(["=", "+", "-", "@"]);

function isSkippableLeadingChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  // Espacios en blanco y caracteres de control (<= 0x1F / DEL) al inicio:
  // Excel también evalúa `\t=1+1`.
  return code <= 0x20 || code === 0x7f || ch.trim() === "";
}

/** ¿El primer carácter significativo es un prefijo de fórmula? */
function startsWithFormula(text: string): boolean {
  for (const ch of text) {
    if (isSkippableLeadingChar(ch)) continue;
    return FORMULA_CHARS.has(ch);
  }
  return false;
}

export function sanitizeCsvCell(value: unknown): unknown {
  if (typeof value === "string" && startsWithFormula(value)) {
    return `'${value}`;
  }
  return value;
}

function sanitizeHeader(key: string): string {
  return startsWithFormula(key) ? `'${key}` : key;
}

function sanitizeCsvRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[sanitizeHeader(key)] = sanitizeCsvCell(value);
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
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  // B-5: revocar en el mismo tick del click cancela la descarga en Firefox;
  // diferir la revocación 1s da tiempo a que el navegador consuma el blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
