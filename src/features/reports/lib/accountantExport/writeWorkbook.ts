import type { ExportSheet } from "./model";
import type { WorkBook, WorkSheet } from "@e965/xlsx";

/** Explicit cell types: user-controlled text can never become an Excel formula. */
export async function createAccountantWorkbook(sheets: ExportSheet[]): Promise<WorkBook> {
  const XLSX = await import("@e965/xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const headers = [...new Set([...(sheet.headers ?? []), ...sheet.rows.flatMap((row) => Object.keys(row))])];
    const data = [headers, ...sheet.rows.map((row) => headers.map((header) => row[header] ?? ""))];
    if (data.length > 1_048_576) throw new Error(`La hoja ${sheet.name} excede el límite de Excel. Reduce el periodo; no se descargó un archivo truncado.`);
    const ws: WorkSheet = {};
    data.forEach((row, r) => row.forEach((value, c) => {
      const address = XLSX.utils.encode_cell({ r, c });
      ws[address] = typeof value === "number" && Number.isFinite(value)
        ? { t: "n", v: value, z: "#,##0.00" }
        : typeof value === "boolean" ? { t: "b", v: value } : { t: "s", v: String(value ?? "") };
    }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: Math.max(0, headers.length - 1) } });
    ws["!autofilter"] = { ref: ws["!ref"] };
    ws["!cols"] = headers.map((header) => ({ wch: /ID|UUID|RFC/.test(header) ? 38 : header === "Valor" ? 100 : 24 }));
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  return workbook;
}

export async function saveAccountantWorkbook(sheets: ExportSheet[], filename: string, shouldSave: () => boolean): Promise<void> {
  const workbook = await createAccountantWorkbook(sheets);
  const XLSX = await import("@e965/xlsx");
  if (!shouldSave()) throw new Error("El contexto cambió. Vuelve a exportar.");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  // Process queued cancellation/identity events before the irreversible browser download.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!shouldSave()) throw new Error("El contexto cambió. Vuelve a exportar.");
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  try {
    const a = document.createElement("a"); a.href = url; a.download = filename; a.rel = "noopener"; a.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
