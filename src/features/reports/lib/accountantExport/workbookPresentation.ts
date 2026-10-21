import type { Cell, ExportRow } from "./model";
import type { CellObject } from "@e965/xlsx";

const identity = /(?:^|\s)(?:ID|UUID|RFC)(?:\s|$)|folio|^Serie$|SAT$|^Uso CFDI$|^SHA256$/i;
const civilHeader = /^(?:Fecha(?:\s.*)?|Vencimiento|Cobertura desde|Cobertura hasta|Desde|Hasta)$/;

/** Civil dates are arithmetic on UTC components, never interpreted in the browser timezone. */
function civilSerial(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") return null;
  const milliseconds = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  // Excel's fictitious 1900-02-29 is preserved without shifting real January/February dates.
  return (milliseconds - Date.UTC(1899, 11, 31)) / 86_400_000 + (value >= "1900-03-01" ? 1 : 0);
}

function numericCell(value: number, header: string, controlValue: boolean): CellObject {
  const integer = /^(Registros|Parcialidad|Bytes)$/.test(header) || controlValue;
  return { t: "n", v: value, z: /^TC(?:\s|$)/.test(header) ? "#,##0.000000" : integer ? "#,##0" : "#,##0.00" };
}

const isFiniteNumber = (value: Cell): value is number => typeof value === "number" && Number.isFinite(value);

export function accountantCell(value: Cell, header: string, row: ExportRow, sheet: string): CellObject {
  const controlValue = sheet === "Control" && header === "Valor";
  if (controlValue && isFiniteNumber(value)) return numericCell(value, header, true);
  const semantic = controlValue ? String(row.Concepto ?? header) : header;
  if (identity.test(semantic)) return { t: "s", v: String(value ?? ""), z: "@" };
  if (typeof value === "string" && civilHeader.test(semantic)) {
    const serial = civilSerial(value);
    if (serial !== null) return { t: "n", v: serial, z: "dd/mm/yyyy" };
  }
  if (isFiniteNumber(value)) {
    return numericCell(value, header, false);
  }
  return typeof value === "boolean" ? { t: "b", v: value } : { t: "s", v: String(value ?? "") };
}

export function accountantColumnWidth(header: string, values: Cell[]): number {
  const maximum = header === "Valor" ? 100 : /Descripción|Motivo|Advertencia|Alcance|Fuente/.test(header) ? 58 : 42;
  let width = Math.max(14, Math.min(header.length + 3, 32));
  for (const value of values) {
    const length = typeof value === "number" ? String(value).length + 5 : String(value ?? "").split(/\r?\n/).reduce((longest, line) => Math.max(longest, line.length), 0) + 2;
    width = Math.max(width, Math.min(maximum, length));
  }
  return Math.min(maximum, width);
}

/** Decorate only our own generated OOXML. Existing number formats and worksheet data are retained. */
export async function styleAccountantXlsx(bytes: Uint8Array): Promise<Uint8Array> {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const files = unzipSync(bytes);
  let styles = strFromU8(files["xl/styles.xml"]);
  const append = (tag: string, content: string): number => {
    const expression = new RegExp(`<${tag} count="(\\d+)"[^>]*>([\\s\\S]*?)</${tag}>`);
    const match = styles.match(expression);
    if (!match) throw new Error("No fue posible aplicar el formato del Excel.");
    const index = Number(match[1]);
    styles = styles.replace(expression, `<${tag} count="${index + 1}">${match[2]}${content}</${tag}>`);
    return index;
  };
  const font = append("fonts", '<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><b/></font>');
  const headerFill = append("fills", '<fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill>');
  const stripeFill = append("fills", '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FA"/><bgColor indexed="64"/></patternFill></fill>');
  const xfBlock = styles.match(/<cellXfs count="\d+"[^>]*>([\s\S]*?)<\/cellXfs>/);
  const original = xfBlock?.[1].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g);
  if (!original?.length) throw new Error("No fue posible aplicar el formato del Excel.");
  const variant = (xf: string, fill: number, heading: boolean) => {
    const start = xf.match(/^<xf\b[^>]*>/)?.[0];
    if (!start) throw new Error("Estilo de celda inesperado en Excel.");
    let opening = start.replace(/\/?>(?:$)/, "");
    opening = opening.replace(/\s(?:fillId|applyFill|applyAlignment|fontId|applyFont)="[^"]*"/g, "");
    const originalFont = xf.match(/\bfontId="(\d+)"/)?.[1] ?? "0";
    const rest = xf.endsWith("/>") ? "" : xf.slice(xf.indexOf(">") + 1, -5).replace(/<alignment\b[^>]*(?:\/>|>[\s\S]*?<\/alignment>)/g, "");
    return `${opening} fillId="${fill}" fontId="${heading ? font : originalFont}" applyFill="1" applyFont="1" applyAlignment="1">${rest}<alignment vertical="top" wrapText="1"${heading ? ' horizontal="left"' : ""}/></xf>`;
  };
  const base = original.length;
  const variants = [...original.map((xf) => variant(xf, 0, false)), ...original.map((xf) => variant(xf, stripeFill, false))];
  const heading = base + variants.length;
  styles = styles.replace(/<cellXfs count="\d+"[^>]*>[\s\S]*?<\/cellXfs>/,
    `<cellXfs count="${heading + 1}">${original.join("")}${variants.join("")}${variant(original[0], headerFill, true)}</cellXfs>`);
  files["xl/styles.xml"] = strToU8(styles);
  for (const path of Object.keys(files).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))) {
    let xml = strFromU8(files[path]);
    if (!/<sheetViews\b[^>]*>[\s\S]*?<\/sheetViews>/.test(xml)) throw new Error("No fue posible congelar el encabezado del Excel.");
    xml = xml.replace(/<sheetViews\b[^>]*>[\s\S]*?<\/sheetViews>/,
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>');
    xml = xml.replace(/<c\b([^>]*)>/g, (cell, attributes: string) => {
      const row = Number(attributes.match(/\br="[A-Z]+(\d+)"/)?.[1]);
      const current = Number(attributes.match(/\bs="(\d+)"/)?.[1] ?? "0");
      if (!row || current >= base) throw new Error("Formato de celda inesperado en Excel.");
      const style = row === 1 ? heading : base + (row % 2 === 1 ? base : 0) + current;
      return `<c${attributes.replace(/\s+s="\d+"/, "").replace(/\/$/, "")} s="${style}"${attributes.endsWith("/") ? "/" : ""}>`;
    });
    files[path] = strToU8(xml);
  }
  // Store-only avoids another compression pass on large exports.
  return zipSync(files, { level: 0 });
}
