import { useQuery } from "@tanstack/react-query";
import { quoteKeys } from "@/features/quotes";
import { supabase } from "@/integrations/supabase/client";
import { verifyContractRevenue, type ContractQuoteTerms, type ContractRevenueBooking } from "../../lib/contractRevenueVerification";

export function useContractRevenueVerification(
  booking: ContractRevenueBooking | null | undefined,
  bookingIsLoading: boolean,
  bookingIsError: boolean,
) {
  const quoteId = booking?.quote_id;
  const organizationId = booking?.organization_id;
  const enabled = !!quoteId && !!organizationId;
  const source = useQuery({
    // Separate from quote detail: this projection must not replace its full cache entry.
    queryKey: [...quoteKeys.all, "contract-terms", { quoteId, organizationId }],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("id, organization_id, line_items, rental_meta")
        .eq("id", quoteId ?? "")
        .eq("organization_id", organizationId ?? "")
        .maybeSingle()
        .returns<ContractQuoteTerms | null>();
      if (error) throw error;
      return data;
    },
  });
  return verifyContractRevenue({
    booking,
    quote: source.data,
    isLoading: bookingIsLoading || (enabled && source.isFetching),
    isError: bookingIsError || (enabled && source.isError),
  });
}
