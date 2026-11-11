import * as XLSX from "@e965/xlsx";
import { accountantCell, accountantColumnWidth, styleAccountantXlsx } from "./workbookPresentation";
import type { ExportSheet } from "./model";
import type { WorkBook, WorkSheet } from "@e965/xlsx";

/** Explicit cell types keep user-controlled text from becoming Excel formulas. */
export function createAccountantWorkbook(sheets: ExportSheet[]): WorkBook {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const headers = [...new Set([...(sheet.headers ?? []), ...sheet.rows.flatMap((row) => Object.keys(row))])];
    const data = [headers, ...sheet.rows.map((row) => headers.map((header) => row[header] ?? ""))];
    if (data.length > 1_048_576) throw new Error(`La hoja ${sheet.name} excede el límite de Excel. Reduce el periodo; no se descargó un archivo truncado.`);
    const ws: WorkSheet = {};
    data.forEach((row, r) => row.forEach((value, c) => {
      const address = XLSX.utils.encode_cell({ r, c });
      ws[address] = r === 0 ? { t: "s", v: String(value) } : accountantCell(value, headers[c], sheet.rows[r - 1], sheet.name);
    }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length - 1, c: Math.max(0, headers.length - 1) } });
    ws["!autofilter"] = { ref: ws["!ref"] };
    const widths = headers.map((header) => accountantColumnWidth(header, sheet.rows.map((row) => row[header] ?? "")));
    ws["!cols"] = widths.map((wch) => ({ wch }));
    ws["!rows"] = data.map((row, r) => ({ hpt: Math.min(180, Math.max(r === 0 ? 32 : 21, ...row.map((value, c) =>
      String(value ?? "").split(/\r?\n/).reduce((lines, part) => lines + Math.max(1, Math.ceil(part.length / Math.max(1, widths[c] - 2))), 0) * 15 + 6))) }));
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  return workbook;
}

export function buildAccountantWorkbookBytes(sheets: ExportSheet[]): Promise<Uint8Array> {
  const workbook = createAccountantWorkbook(sheets);
  return styleAccountantXlsx(new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" })));
}
