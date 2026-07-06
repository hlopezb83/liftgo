import type { LineItem } from "@/lib/domain/invoiceHelpers";
import type { LineItemValues } from "@/features/invoices/lib/invoiceFormSchema";

const RENTAL_KEYWORDS = ["Renta mensual", "Renta semanal", "Renta diaria"];
const SALE_SUFFIX = /Venta de equipo/i;

/**
 * Determina si una partida de cotización corresponde a renta o venta de equipo.
 * Se usa para separar servicios adicionales (logística, entrega, etc.) que no
 * son generados automáticamente al facturar desde reserva.
 */
function isRentalOrSaleLine(description: string | undefined): boolean {
  if (!description) return false;
  if (SALE_SUFFIX.test(description)) return true;
  return RENTAL_KEYWORDS.some((kw) => description.includes(kw));
}

/**
 * Extrae de las partidas de una cotización aquellas que NO son renta ni venta
 * de equipo (típicamente "Servicio de Logística" o "Entrega"). Las normaliza
 * al shape de LineItemValues con claves SAT para servicios de flete.
 *
 * Al facturar desde reserva, estas partidas se anexan a la factura para que
 * el costo pactado en la cotización no se pierda en el limbo.
 */
export function extractNonRentalLines(quoteLineItems: unknown): LineItemValues[] {
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
      // Servicio de flete/transporte de carga
      clave_prod_serv: "78101800",
      clave_unidad: "E48",
      objeto_imp: "02",
    }));
}
