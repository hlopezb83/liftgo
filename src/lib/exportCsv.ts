import Papa from "papaparse";

/**
 * Exporta filas a CSV usando papaparse.
 * - Agrega BOM UTF-8 para que Excel (es-MX) detecte acentos correctamente.
 * - Escapa comillas, comas y saltos de línea dentro de celdas.
 * - Usa CRLF como newline (estándar Excel).
 */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
): void {
  if (rows.length === 0) return;

  const csv = Papa.unparse(rows, { header: true, newline: "\r\n" });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
