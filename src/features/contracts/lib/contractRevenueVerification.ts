export interface ContractRevenueBooking {
  quote_id: string | null;
  organization_id?: string | null;
}

export interface ContractQuoteTerms {
  id: string;
  organization_id: string;
  line_items: unknown;
  rental_meta: unknown;
}

export interface ContractRevenueVerification {
  status: "verified" | "loading" | "review";
  reason: string | null;
}

function hasDiscount(quote: ContractQuoteTerms): boolean {
  return [quote.line_items, quote.rental_meta].some((rows) => Array.isArray(rows)
    && rows.some((row) => row && typeof row === "object" && Number(row.discount) > 0));
}

/** Gross contract rates cannot establish the net agreement of a discounted quote. */
export function verifyContractRevenue({
  booking, quote, isLoading, isError,
}: {
  booking: ContractRevenueBooking | null | undefined;
  quote: ContractQuoteTerms | null | undefined;
  isLoading: boolean;
  isError: boolean;
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
  if (hasDiscount(quote)) {
    return { status: "review", reason: "La cotización tiene descuento. Revisa el importe pactado; las tarifas del contrato no incluyen ese descuento." };
  }
  return { status: "verified", reason: null };
}
