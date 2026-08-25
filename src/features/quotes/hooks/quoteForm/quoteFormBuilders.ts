import { generateLineItemsFromModel, type LineItem } from "@/lib/domain/invoiceHelpers";
import { lineItemTotal, money } from "@/lib/domain/invoiceTotals";
import { toYMD } from "@/lib/format/dateFormats";

export type EquipmentModel = { id: string; manufacturer: string; model: string };
export type SaleLine = { modelId: string; quantity: number; unitPrice: number; discount?: number; discountType?: "%" | "$" };
export type RentalLine = { modelId: string; quantity: number; dailyRate: number; weeklyRate: number; monthlyRate: number; discount?: number; discountType?: "%" | "$"; legacyTotal?: number; legacyDescription?: string };

export function buildSaleItems(lines: SaleLine[], models: EquipmentModel[]): LineItem[] {
  return lines
    .filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0)
    .map((l) => {
      const m = models.find((em) => em.id === l.modelId);
      return {
        description: m ? `${m.manufacturer} ${m.model} - Venta de equipo` : "Venta de equipo",
        quantity: l.quantity,
        unit_price: l.unitPrice,
        // B-8: total monetario redondeado (antes float crudo).
        total: lineItemTotal(l.quantity, l.unitPrice),
        discount: l.discount || 0,
        discount_type: l.discountType || "%",
      };
    });
}

export function buildRentalItems(
  lines: RentalLine[], models: EquipmentModel[], startDate: Date, endDate: Date,
): LineItem[] {
  const items: LineItem[] = [];
  // R13-FE-01 (P1): conservar partidas legacy sin modelo con su importe
  // histórico (antes se filtraban y al guardar borraban line_items -> $0).
  for (const line of lines.filter((l) => !l.modelId && (l.legacyTotal ?? 0) > 0)) {
    const unitPrice = line.legacyTotal ?? 0;
    const item: LineItem = {
      description: line.legacyDescription ?? "Renta montacargas",
      quantity: line.quantity,
      unit_price: unitPrice,
      // B-8: total monetario redondeado (antes float crudo).
      total: lineItemTotal(line.quantity, unitPrice),
    };
    if (line.discount && line.discount > 0) {
      item.discount = line.discount;
      item.discount_type = line.discountType;
    }
    items.push(item);
  }
  const valid = lines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
  for (const line of valid) {
    const model = models.find((m) => m.id === line.modelId);
    const modelName = model ? `${model.manufacturer} ${model.model}` : "Equipo";
    const generated = generateLineItemsFromModel(
      modelName, line.dailyRate, line.weeklyRate, line.monthlyRate,
      toYMD(startDate), toYMD(endDate), line.quantity,
    );
    // M-9: el descuento fijo "$" es por línea de renta, no por partida. Antes
    // se aplicaba solo a la primera partida y el remanente se perdía cuando esa
    // partida no lo absorbía entera. Ahora se distribuye en cascada: cada
    // partida absorbe hasta su propio total hasta agotar el descuento.
    let remainingDiscount =
      line.discountType === "$" && line.discount && line.discount > 0 ? line.discount : 0;
    for (const item of generated) {
      if (line.discountType === "$") {
        if (remainingDiscount > 0) {
          // Nunca descontar más que el total de la partida (clamp a 0).
          const applied = Math.min(remainingDiscount, item.total || 0);
          item.discount = money(applied).value;
          item.discount_type = "$";
          remainingDiscount = money(remainingDiscount).subtract(applied).value;
        }
      } else if (line.discount && line.discount > 0) {
        // Los "%" son porcentuales y sí aplican a cada partida.
        item.discount = line.discount;
        item.discount_type = line.discountType;
      }
      items.push(item);
    }
  }
  return items;
}
