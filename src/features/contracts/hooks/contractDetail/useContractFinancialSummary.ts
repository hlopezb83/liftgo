import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "@/features/invoices/lib/queryKeys";

export function useContractFinancialSummary(bookingId: string) {
  return useQuery({
    queryKey: invoiceKeys.list({ booking_id: bookingId }),
    enabled: !!bookingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("total, status")
        .eq("booking_id", bookingId)
        .neq("status", "cancelled");
      if (error) throw error;
      return data;
    },
  });
}
