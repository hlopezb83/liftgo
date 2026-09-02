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

// Las partidas de renta GENERADAS (rentalCalculation.generateLineItemsFrom*)
// tienen formato exacto `<equipo> — Renta mensual|semanal|diaria…`: la palabra
// clave va siempre tras el separador " — ". Antes se buscaba el substring en
// cualquier posición, así que una línea manual como "Cargo por Renta mensual
// atrasada" se descartaba por falso positivo. Anclamos al formato generado.
const GENERATED_RENTAL_LINE = / — Renta (mensual|semanal|diaria)/;
const SALE_SUFFIX = /Venta de equipo/i;

/**
 * Determina si una partida de cotización corresponde a renta o venta de equipo.
 * Se usa para separar servicios adicionales (logística, entrega, etc.) que no
 * son generados automáticamente al facturar desde reserva.
 */
function isRentalOrSaleLine(description: string | undefined): boolean {
  if (!description) return false;
  if (SALE_SUFFIX.test(description)) return true;
  return GENERATED_RENTAL_LINE.test(description);
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
    .filter((item) => !isRentalOrSaleLine(item.description))
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

/**
 * FIX-4: ¿las partidas de una factura incluyen al menos una partida extra
 * (no renta ni venta de equipo)? Se usa para no volver a pre-cargar seguro /
 * logística en una segunda factura de la misma reserva.
 */
export function hasNonRentalLines(lineItems: unknown): boolean {
  if (!Array.isArray(lineItems)) return false;
  return (lineItems as LineItem[]).some((item) => !isRentalOrSaleLine(item.description));
}
