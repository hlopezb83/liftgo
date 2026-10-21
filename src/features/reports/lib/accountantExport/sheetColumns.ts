import type { ExportSheet } from "./model";

// A stable schema also makes empty, authorized sections usable. Technical keys
// remain available at the right; the source rows themselves are never changed.
const columns: Record<string, string[]> = {
  Ventas: ["Folio", "Fecha", "Vencimiento", "Cliente", "RFC receptor", "Moneda", "Subtotal", "IVA", "Total original", "TC registrado", "Total MXN calculado", "Estado", "Estado CFDI", "Ambiente", "UUID"],
  "Notas de crédito": ["Folio", "Fecha", "Factura folio", "Moneda", "Subtotal", "IVA", "Total original", "Estado", "Estado factura", "Estado CFDI", "Ambiente", "UUID", "Naturaleza"],
  Cobros: ["Fecha", "Factura folio", "Moneda", "Total original", "TC registrado", "Importe MXN persistido", "Método pago", "Referencia", "Parcialidad", "Saldo anterior registrado", "Estado factura", "UUID REP", "Estado REP", "Ambiente"],
  "REP asociados a cobros": ["REP folio", "Fecha cobro", "UUID", "Estado", "Estado cancelación", "Moneda", "Importe referencia no sumable", "Parcialidad"],
  Compras: ["Folio", "Fecha", "Vencimiento", "Proveedor nombre actual", "Proveedor RFC actual", "Moneda", "Subtotal", "Descuento", "IVA", "Retención ISR", "Retención IVA", "Total original", "TC registrado", "Total MXN calculado", "Estado", "Estado aprobación", "Categoría", "UUID"],
  "Pagos proveedores": ["Fecha", "Factura folio", "Moneda", "Total original", "Método pago", "Referencia", "Estado factura", "REP requerido", "Estado REP recibido", "UUID REP recibido"],
  "Gastos operativos": ["Fecha", "Categoría", "Descripción", "Importe registrado", "Moneda", "IVA", "Vínculo", "UUID"],
  Referencias: ["Tipo", "Folio", "Fecha", "Moneda", "UUID", "Alcance"],
};

export function withAccountantColumns(sheet: ExportSheet): ExportSheet {
  const preferred = columns[sheet.name];
  if (!preferred) return sheet;
  const existing = [...new Set([...(sheet.headers ?? []), ...sheet.rows.flatMap(Object.keys)])];
  const technical = (header: string) => header === "ID" || header.endsWith(" ID") || header === "Alcance";
  return { ...sheet, headers: [...new Set([
    ...preferred,
    ...existing.filter((header) => !technical(header)),
    ...existing.filter(technical),
  ])] };
}
