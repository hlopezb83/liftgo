import { toast } from "sonner";
import type { RentalLine, SaleLine } from "./quoteFormBuilders";

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
