/**
 * FIX-6 (ronda 2): extracción de partidas EXTRA de una cotización (seguro,
 * logística, entrega…), espejo Deno de `src/lib/domain/nonRentalLines.ts`.
 * Se mantiene duplicado porque las Edge Functions no pueden importar `@/`.
 * Cualquier cambio de criterio debe aplicarse en ambos archivos.
 */
export interface NonRentalLineDto {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  clave_prod_serv: string;
  clave_unidad: string;
  objeto_imp: string;
}

const GENERATED_RENTAL_LINE = / — Renta (mensual|semanal|diaria)/;
const SALE_SUFFIX = /Venta de equipo/i;

function isRentalOrSaleLine(description: string | undefined): boolean {
  if (!description) return false;
  if (SALE_SUFFIX.test(description)) return true;
  return GENERATED_RENTAL_LINE.test(description);
}

export function extractNonRentalLines(quoteLineItems: unknown): NonRentalLineDto[] {
  if (!Array.isArray(quoteLineItems)) return [];
  const items = quoteLineItems as Array<Record<string, unknown>>;
  return items
    .filter((item) => !isRentalOrSaleLine(item?.description as string | undefined))
    .map((item) => {
      const description = String(item?.description ?? "");
      const quantity = Number(item?.quantity ?? 1) || 0;
      const unitPrice = Number(item?.unit_price ?? 0) || 0;
      const total = Number(item?.total ?? quantity * unitPrice) || 0;
      return {
        description,
        quantity,
        unit_price: unitPrice,
        total,
        clave_prod_serv: /seguro/i.test(description) ? "84131500" : "78101800",
        clave_unidad: "E48",
        objeto_imp: "02",
      };
    })
    .filter((l) => l.description.trim() !== "" && l.total > 0);
}
