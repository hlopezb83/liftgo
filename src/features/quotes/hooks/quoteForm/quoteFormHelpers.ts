import { format } from "date-fns";
import { toast } from "sonner";
import { generateLineItemsFromModel, type LineItem } from "@/lib/domain/invoiceUtils";
import { toJsonArray } from "@/lib/lineItems";
import { nowMty } from "@/lib/utils";

export type EquipmentModel = { id: string; manufacturer: string; model: string };
export type SaleLine = { modelId: string; quantity: number; unitPrice: number; discount?: number; discountType?: "%" | "$" };
export type RentalLine = { modelId: string; quantity: number; dailyRate: number; weeklyRate: number; monthlyRate: number; discount?: number; discountType?: "%" | "$" };

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
  const valid = lines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
  for (const line of valid) {
    const model = models.find((m) => m.id === line.modelId);
    const modelName = model ? `${model.manufacturer} ${model.model}` : "Equipo";
    const generated = generateLineItemsFromModel(
      modelName, line.dailyRate, line.weeklyRate, line.monthlyRate,
      format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"), line.quantity,
    );
    for (const item of generated) {
      if (line.discount && line.discount > 0) {
        item.discount = line.discount;
        item.discount_type = line.discountType;
      }
      items.push(item);
    }
  }
  return items;
}

export function validateQuoteForm(opts: {
  customerId: string;
  quoteType: string;
  startDate?: Date;
  endDate?: Date;
  rentalLines: RentalLine[];
  saleLines: SaleLine[];
}): boolean {
  if (!opts.customerId) { toast.error("Selecciona un cliente"); return false; }
  if (opts.quoteType === "rental") {
    if (!opts.startDate || !opts.endDate) { toast.error("Selecciona el periodo de renta"); return false; }
    const valid = opts.rentalLines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
    if (valid.length === 0) { toast.error("Agrega al menos un modelo con tarifas"); return false; }
  } else {
    const valid = opts.saleLines.filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0);
    if (valid.length === 0) { toast.error("Agrega al menos un modelo con cantidad y precio"); return false; }
  }
  return true;
}
