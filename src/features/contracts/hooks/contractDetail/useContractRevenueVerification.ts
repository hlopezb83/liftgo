import { useQuery } from "@tanstack/react-query";
import { quoteKeys, hasQuotedDiscount, type QuotedRentalBooking } from "@/features/quotes";
import { supabase } from "@/integrations/supabase/client";
import { verifyContractRevenue, type ContractPriceTerms, type ContractQuoteTerms, type ContractRevenueBooking } from "../../lib/contractRevenueVerification";

type QuoteBooking = QuotedRentalBooking & { forklifts: { equipment_model_id: string | null } | null };

export function useContractRevenueVerification(
  booking: ContractRevenueBooking | null | undefined,
  bookingIsLoading: boolean,
  bookingIsError: boolean,
  terms?: ContractPriceTerms,
) {
  const quoteId = booking?.quote_id;
  const organizationId = booking?.organization_id;
  const enabled = !!quoteId && !!organizationId;
  const source = useQuery({
    // Separate from quote detail: this projection must not replace its full cache entry.
    queryKey: [...quoteKeys.all, "contract-terms", { quoteId, organizationId, bookingId: booking?.id, bookingVersion: booking?.version }],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("id, organization_id, line_items, rental_meta, start_date, end_date, currency")
        .eq("id", quoteId ?? "")
        .eq("organization_id", organizationId ?? "")
        .maybeSingle()
        .returns<ContractQuoteTerms | null>();
      if (error) throw error;
      if (!data) return null;
      if (!hasQuotedDiscount(data)) return data;
      const { data: siblings, error: siblingsError, count } = await supabase.from("bookings")
        .select("id, organization_id, quote_id, forklift_id, status, start_date, end_date, recurring_billing, daily_rate, weekly_rate, monthly_rate, currency, forklifts(equipment_model_id)", { count: "exact" })
        .eq("quote_id", quoteId ?? "")
        .eq("organization_id", organizationId ?? "")
        .limit(1001)
        .returns<QuoteBooking[]>();
      if (siblingsError) throw siblingsError;
      if (count !== (siblings ?? []).length) throw new Error("No se pudieron verificar todas las reservas de la cotización.");
      return { ...data, bookings: siblings ?? [], units: (siblings ?? []).map((row) => ({
        id: row.forklift_id, equipment_model_id: row.forklifts?.equipment_model_id,
      })) };
    },
  });
  return verifyContractRevenue({
    booking,
    quote: source.data,
    isLoading: bookingIsLoading || (enabled && source.isFetching),
    isError: bookingIsError || (enabled && source.isError),
    terms,
  });
}
