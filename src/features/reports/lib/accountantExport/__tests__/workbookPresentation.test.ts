import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "@e965/xlsx";
import { createAccountantWorkbook, serializeAccountantWorkbook } from "../writeWorkbook";
import type { ExportSheet } from "../model";

const sheets: ExportSheet[] = [{ name: "Prueba", rows: [
  { Fecha: "2024-02-29", "Actualizado UTC": "2024-02-29T23:59:59-06:00", "Total original": 1234.5, "TC registrado": 17.123456,
    Registros: 2, "Tasa IVA capturada": 16, ID: "00001234567890123456789", UUID: "=HYPERLINK(\"https://bad\")", Texto: "+1+1", Parcialidad: 1 },
  { Fecha: "2024-03-01", "Total original": -25, Texto: "@SUM(A1)", ID: "00002" },
] }, { name: "Vacía", headers: ["Fecha", "Total original"], rows: [] }];
const xml = (bytes: Uint8Array, path: string) => strFromU8(unzipSync(bytes)[path]);

describe("accountant XLSX presentation", () => {
  it("roundtrips sortable civil dates, precise money/rates, integer counts and safe text", async () => {
    const bytes = await serializeAccountantWorkbook(sheets);
    const workbook = XLSX.read(bytes, { type: "array", cellNF: true, cellStyles: true });
    const ws = workbook.Sheets.Prueba;
    expect(ws.A2).toMatchObject({ t: "n", v: 45351, z: "dd/mm/yyyy", w: "29/02/2024" });
    expect(ws.A3.v).toBe(ws.A2.v + 1);
    expect(ws.B2).toMatchObject({ t: "s", v: "2024-02-29T23:59:59-06:00" });
    expect(ws.C2).toMatchObject({ t: "n", v: 1234.5, z: "#,##0.00", w: "1,234.50" });
    expect(ws.D2).toMatchObject({ t: "n", v: 17.123456, z: "#,##0.000000" });
    expect(ws.E2).toMatchObject({ t: "n", v: 2, z: "#,##0" });
    expect(ws.F2).toMatchObject({ t: "n", v: 16, w: "16.00" });
    expect(ws.G2).toMatchObject({ t: "s", v: "00001234567890123456789" });
    expect(ws.H2).toMatchObject({ t: "s", v: '=HYPERLINK("https://bad")' });
    expect(ws.I2).toMatchObject({ t: "s", v: "+1+1" });
    expect(ws.J2).toMatchObject({ t: "n", v: 1, z: "#,##0" });
    expect(Object.values(ws).some((cell) => cell && typeof cell === "object" && "f" in cell)).toBe(false);
    expect(ws["!autofilter"]).toEqual({ ref: "A1:J3" });
    expect(workbook.SheetNames).toEqual(["Prueba", "Vacía"]);
  });

  it("writes actual OOXML header, stripe, freeze, filter, wrap and row/column sizing", async () => {
    const bytes = await serializeAccountantWorkbook(sheets);
    const styles = xml(bytes, "xl/styles.xml");
    const parsed = new DOMParser().parseFromString(styles, "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    const xfs = [...parsed.getElementsByTagName("cellXfs")[0].children];
    const fonts = [...parsed.getElementsByTagName("fonts")[0].children];
    const fills = [...parsed.getElementsByTagName("fills")[0].children];
    for (const index of [1, 2]) {
      const sheet = new DOMParser().parseFromString(xml(bytes, `xl/worksheets/sheet${index}.xml`), "application/xml");
      expect(sheet.querySelector("parsererror")).toBeNull();
      const pane = sheet.querySelector("pane");
      expect(pane?.getAttribute("state")).toBe("frozen");
      expect(pane?.getAttribute("topLeftCell")).toBe("A2");
      expect(pane?.getAttribute("ySplit")).toBe("1");
      expect(sheet.querySelector("autoFilter")).not.toBeNull();
      expect(sheet.querySelector('row[r="1"]')?.getAttribute("ht")).toBe("32");
      const heading = xfs[Number(sheet.querySelector('c[r="A1"]')?.getAttribute("s"))];
      expect(fonts[Number(heading.getAttribute("fontId"))].querySelector("b")).not.toBeNull();
      expect(fonts[Number(heading.getAttribute("fontId"))].querySelector("color")?.getAttribute("rgb")).toBe("FFFFFFFF");
      expect(fills[Number(heading.getAttribute("fillId"))].querySelector("fgColor")?.getAttribute("rgb")).toBe("FF17365D");
      if (index === 1) {
        const normal = xfs[Number(sheet.querySelector('c[r="A2"]')?.getAttribute("s"))];
        const stripe = xfs[Number(sheet.querySelector('c[r="A3"]')?.getAttribute("s"))];
        expect(normal.getAttribute("fillId")).not.toBe(stripe.getAttribute("fillId"));
        expect(stripe.querySelector("alignment")?.getAttribute("wrapText")).toBe("1");
      }
      for (const col of sheet.querySelectorAll("col")) expect(Number(col.getAttribute("width"))).toBeLessThan(44);
    }
  });

  it("keeps invalid dates and UTC metadata untouched; handles Control counts and bounded prose", async () => {
    const workbook = await createAccountantWorkbook([{ name: "Control", rows: [
      { Concepto: "Desde", Valor: "2026-10-01" }, { Concepto: "Inicio extracción UTC", Valor: "2026-10-01T00:00:00Z" },
      { Concepto: "UUID no disponible: Ventas", Valor: 10 }, { Concepto: "Guía", Valor: "Texto ".repeat(400) },
    ] }, { name: "Fechas", rows: [{ Fecha: "2024-02-30", Vencimiento: "2024-03-10T00:00:00Z", ID: 123 }] }]);
    expect(workbook.Sheets.Control.B2.z).toBe("dd/mm/yyyy");
    expect(workbook.Sheets.Control.B3.t).toBe("s");
    expect(workbook.Sheets.Control.B4).toMatchObject({ t: "n", v: 10, z: "#,##0" });
    expect(workbook.Sheets.Control["!cols"]?.[1].wch).toBe(100);
    expect(workbook.Sheets.Fechas.A2).toMatchObject({ t: "s", v: "2024-02-30" });
    expect(workbook.Sheets.Fechas.B2.t).toBe("s");
    expect(workbook.Sheets.Fechas.C2).toMatchObject({ t: "s", v: "123" });
  });

  it("preserves more than 10,000 rows without truncating filters or final records", async () => {
    const rows = Array.from({ length: 11_001 }, (_, index) => ({ ID: `id-${index}`, Fecha: "2026-10-01", Importe: index + 0.25 }));
    const workbook = XLSX.read(await serializeAccountantWorkbook([{ name: "Volumen", rows }]), { type: "array" });
    const sheet = workbook.Sheets.Volumen;
    expect(sheet["!ref"]).toBe("A1:C11002");
    expect(sheet["!autofilter"]).toEqual({ ref: "A1:C11002" });
    expect(sheet.A11002.v).toBe("id-11000");
    expect(sheet.C11002.v).toBe(11000.25);
    expect(XLSX.utils.sheet_to_json(sheet)).toHaveLength(11001);
  });

});
