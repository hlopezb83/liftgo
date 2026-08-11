import { generateLineItemsFromModel, type LineItem } from "@/lib/domain/invoiceHelpers";
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
        total: l.quantity * l.unitPrice,
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
      total: unitPrice * line.quantity,
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
    for (const [index, item] of generated.entries()) {
      // El descuento fijo "$" es por línea de renta, no por partida: copiarlo a
      // cada partida generada (mensual+semanal+diaria) hacía que computeTotals
      // lo descontara N veces. Se aplica solo a la primera partida, igual que la
      // vista previa. Los "%" son porcentuales y sí aplican a cada partida.
      const appliesToItem = line.discountType !== "$" || index === 0;
      if (line.discount && line.discount > 0 && appliesToItem) {
        item.discount = line.discount;
        item.discount_type = line.discountType;
      }
      items.push(item);
    }
  }
  return items;
}
