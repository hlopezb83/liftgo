import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerSummaryBooking {
  id: string;
  booking_number: string;
  start_date: string;
  end_date: string;
  status: string;
  forklift: { name: string | null; model: string | null } | null;
}

export interface CustomerSummaryInvoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string | null;
  total: number;
  status: string;
}

export interface CustomerSummary {
  bookings: CustomerSummaryBooking[];
  invoices: CustomerSummaryInvoice[];
  totals: { total_invoiced: number; total_paid: number };
}

export function useCustomerSummary(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer_summary", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomerSummary> => {
      const { data, error } = await supabase.rpc("get_customer_summary", {
        p_customer_id: customerId!,
      });
      if (error) throw error;
      return data as unknown as CustomerSummary;
    },
  });
}
