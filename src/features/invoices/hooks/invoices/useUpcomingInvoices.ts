import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { addDays, format } from "date-fns";
import { nowMty } from "@/lib/utils";

export interface UpcomingInvoice {
  id: string;
  invoice_number: string;
  total: number;
  /** Saldo pendiente (total - pagos aplicados). */
  balance: number;
  due_date: string;
  customer_name: string | null;
}

/**
 * Facturas no pagadas con vencimiento dentro de los próximos 30 días.
 * Devuelve el saldo real (total - pagos) para que el pronóstico de cobranza
 * descuente correctamente los pagos parciales.
 */
export function useUpcomingInvoices() {
  const today = format(nowMty(), "yyyy-MM-dd");
  const in30 = format(addDays(nowMty(), 30), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["upcoming-invoices", today, in30],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<UpcomingInvoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, total, due_date, customer_name, status")
        .in("status", ["sent", "partial"])
        .gte("due_date", today)
        .lte("due_date", in30)
        .order("due_date", { ascending: true });
      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const { data: pays, error: payErr } = await supabase
        .from("payments")
        .select("invoice_id, amount")
        .in("invoice_id", ids);
      if (payErr) throw payErr;

      const paidByInvoice = new Map<string, number>();
      for (const p of pays ?? []) {
        paidByInvoice.set(
          p.invoice_id,
          (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount),
        );
      }

      return rows
        .map((inv) => {
          const total = Number(inv.total);
          const balance = Math.max(total - (paidByInvoice.get(inv.id) ?? 0), 0);
          return {
            id: inv.id,
            invoice_number: inv.invoice_number,
            total,
            balance,
            due_date: inv.due_date as string,
            customer_name: inv.customer_name,
          };
        })
        .filter((inv) => inv.balance > 0.01);
    },
  });
}
