import { applyDiscount } from "@/lib/domain/invoiceTotals";
import { allocateQuotedRentalLines, hasQuotedDiscount, type QuotedRentalBooking, type QuotedRentalUnit, type RentalQuoteSource } from "@/lib/domain/quotedRentalAllocation";
import { sumMoney } from "@/lib/money";

export interface ContractRevenueBooking extends Partial<QuotedRentalBooking> {
  quote_id: string | null;
  organization_id?: string | null;
  version?: number;
}

export interface ContractQuoteTerms extends RentalQuoteSource {
  organization_id: string;
  rental_meta: unknown;
  bookings?: QuotedRentalBooking[];
  units?: QuotedRentalUnit[];
}

export type ContractPriceTerms = Pick<QuotedRentalBooking, "start_date" | "end_date" | "daily_rate" | "weekly_rate" | "monthly_rate">;

export interface ContractRevenueVerification {
  status: "verified" | "loading" | "review";
  reason: string | null;
  expectedRevenue?: number;
}

function quotedRevenue(booking: ContractRevenueBooking, quote: ContractQuoteTerms, terms?: ContractPriceTerms): number | null {
  const original = quote.bookings?.find((row) => row.id === booking.id);
  if (!terms || !original || !quote.units || !quote.bookings) return null;
  try {
    const lines = allocateQuotedRentalLines(quote, [{ ...original, ...terms }], quote.bookings, quote.units);
    return sumMoney(lines.map(applyDiscount));
  } catch {
    return null;
  }
}

/** Gross contract rates cannot establish the net agreement of a discounted quote. */
export function verifyContractRevenue({
  booking, quote, isLoading, isError, terms,
}: {
  booking: ContractRevenueBooking | null | undefined;
  quote: ContractQuoteTerms | null | undefined;
  isLoading: boolean;
  isError: boolean;
  terms?: ContractPriceTerms;
}): ContractRevenueVerification {
  if (isLoading) return { status: "loading", reason: "Verificando el importe pactado." };
  if (!booking || isError) {
    return { status: "review", reason: "No se pudo verificar el importe pactado. Vuelve a consultar la reserva y su cotización." };
  }
  // A loaded booking with an explicit null is legitimately not linked to a quote.
  if (booking.quote_id === null) return { status: "verified", reason: null };
  if (!quote || quote.id !== booking.quote_id || !booking.organization_id
    || quote.organization_id !== booking.organization_id || !Array.isArray(quote.line_items)) {
    return { status: "review", reason: "No se pudo verificar la cotización de origen. Revisa el importe pactado antes de comparar el balance." };
  }
  if (hasQuotedDiscount(quote)) {
    const expectedRevenue = quotedRevenue(booking, quote, terms);
    if (expectedRevenue !== null) return { status: "verified", reason: null, expectedRevenue };
    return { status: "review", reason: "La cotización tiene descuento. Revisa el importe pactado; las tarifas del contrato no incluyen ese descuento." };
  }
  return { status: "verified", reason: null };
}
