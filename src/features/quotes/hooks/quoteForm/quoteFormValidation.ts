import type { RentalLine, SaleLine } from "./quoteFormBuilders";
import { notifyError } from "@/lib/ui/appFeedback";

export function validateQuoteForm(opts: {
  customerId: string;
  quoteType: string;
  startDate?: Date;
  endDate?: Date;
  rentalLines: RentalLine[];
  saleLines: SaleLine[];
}): boolean {
  if (!opts.customerId) { notifyError({ message: "Selecciona un cliente" }); return false; }
  if (opts.quoteType === "rental") {
    if (!opts.startDate || !opts.endDate) { notifyError({ message: "Selecciona el periodo de renta" }); return false; }
    const valid = opts.rentalLines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
    if (valid.length === 0) { notifyError({ message: "Agrega al menos un modelo con tarifas" }); return false; }
  } else {
    const valid = opts.saleLines.filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0);
    if (valid.length === 0) { notifyError({ message: "Agrega al menos un modelo con cantidad y precio" }); return false; }
  }
  return true;
}
