import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";
import { nowMty } from "@/lib/utils";

export interface UpcomingInvoice {
  id: string;
  invoice_number: string;
  total: number;
  due_date: string;
  customer_name: string | null;
}

/**
 * Facturas no pagadas con vencimiento dentro de los próximos 30 días.
 * Útil para el pronóstico de cobranza del Panel.
 */
export function useUpcomingInvoices() {
  return useQuery({
    queryKey: ["upcoming-invoices"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<UpcomingInvoice[]> => {
      const today = format(nowMty(), "yyyy-MM-dd");
      const in30 = format(addDays(nowMty(), 30), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, due_date, customer_name, status")
        .in("status", ["sent", "partial"])
        .gte("due_date", today)
        .lte("due_date", in30)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        total: Number(inv.total),
        due_date: inv.due_date as string,
        customer_name: inv.customer_name,
      }));
    },
  });
}
