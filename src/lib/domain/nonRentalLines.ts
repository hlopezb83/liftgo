import type { LineItem } from "@/lib/domain/invoiceHelpers";

/**
 * DTO plano equivalente a `LineItemValues` de invoiceFormSchema.
 * Duplicado local para evitar dependencia inversa lib/domain → features/invoices.
 */
export interface NonRentalLineDto {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  discount_type?: "%" | "$";
  clave_prod_serv?: string;
  clave_unidad?: string;
  objeto_imp?: string;
}

// Legacy fallback must match the complete generated description, not a rental
// phrase inside a manual service. Explicit line_kind always takes precedence.
const GENERATED_RENTAL_LINE = /^.+ — Renta (?:mensual|semanal|diaria)(?: \(.*\))?$/;
const GENERATED_EXTENSION_LINE = /^(?:.+ — )?Extensión: Renta (?:mensual|semanal|diaria)(?: \(.*\))?$/;
const GENERATED_CALENDAR_RENTAL_LINE = /^.+ — Renta (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) \d{4} \(\d+ días al precio diario\)$/;
const GENERATED_SALE_LINE = /^.+ - Venta de equipo$/;

/**
 * Determina si una partida de cotización corresponde a renta o venta de equipo.
 * Se usa para separar servicios adicionales (logística, entrega, etc.) que no
 * son generados automáticamente al facturar desde reserva.
 */
function isRentalOrSaleLine(item: LineItem): boolean {
  if (item.line_kind) return item.line_kind === "rental" || item.line_kind === "sale";
  const description = item.description;
  if (!description) return false;
  return GENERATED_RENTAL_LINE.test(description)
    || GENERATED_EXTENSION_LINE.test(description)
    || GENERATED_CALENDAR_RENTAL_LINE.test(description)
    || GENERATED_SALE_LINE.test(description);
}

/**
 * Extrae de las partidas de una cotización aquellas que NO son renta ni venta
 * de equipo (típicamente "Servicio de Logística" o "Entrega"). Las normaliza
 * al shape de LineItemValues con claves SAT para servicios de flete.
 *
 * Al facturar desde reserva, estas partidas se anexan a la factura para que
 * el costo pactado en la cotización no se pierda en el limbo.
 */
export function extractNonRentalLines(quoteLineItems: unknown): NonRentalLineDto[] {
  if (!Array.isArray(quoteLineItems)) return [];
  const items = quoteLineItems as LineItem[];
  return items
    .filter((item) => !isRentalOrSaleLine(item))
    .map((item) => ({
      description: item.description ?? "",
      quantity: Number(item.quantity ?? 1),
      unit_price: Number(item.unit_price ?? 0),
      total: Number(item.total ?? Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)),
      discount: typeof item.discount === "number" ? item.discount : undefined,
      discount_type: (item.discount_type as "%" | "$" | undefined) ?? undefined,
      // Servicio de seguros (84131500) para la partida de seguro;
      // flete/transporte de carga (78101800) para el resto.
      clave_prod_serv: /seguro/i.test(item.description ?? "") ? "84131500" : "78101800",
      clave_unidad: "E48",
      objeto_imp: "02",
    }));
}
