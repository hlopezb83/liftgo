import { roundMoney, toMxn } from "@/lib/money";

interface QuoteValueSource {
  total: number;
  currency?: string | null;
  tipo_cambio?: number | string | null;
}

export function quoteDealValueMxn(quote: QuoteValueSource): { value: number | null; error: string | null } {
  if (!Number.isFinite(quote.total) || quote.total < 0) {
    return { value: null, error: "La cotización necesita un total válido." };
  }
  const code = quote.currency?.trim().toUpperCase() || "MXN";
  const rate = Number(quote.tipo_cambio);
  if (code !== "MXN" && (!Number.isFinite(rate) || rate <= 0 || rate === 1)) {
    return { value: null, error: `La cotización en ${code} necesita un tipo de cambio válido antes de vincularla.` };
  }
  return { value: roundMoney(toMxn(quote.total, code, rate)), error: null };
}
