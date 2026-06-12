import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "@/features/invoices/lib/queryKeys";

export interface InvoiceWithBalance {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_id: string | null;
  status: string;
  total: number;
  paid_amount: number;
  balance: number;
  due_date: string | null;
  issued_at: string;
  booking_id: string | null;
  moneda: string | null;
  tipo_cambio: number | null;
}

interface Filter {
  /** Estados a incluir. Default: ['sent','partial','overdue']. */
  statuses?: ReadonlyArray<string>;
  /** Rango de vencimiento (inclusive). */
  dueFrom?: string;
  dueTo?: string;
  /** Solo facturas con saldo > 0. Default: true. */
  withBalanceOnly?: boolean;
}

/**
 * Fuente única de verdad para "facturas + saldo".
 * Lee de la vista SQL `v_invoices_with_balance`, que calcula
 * `paid_amount` y `balance = total - paid_amount` aplicando RLS
 * de la tabla `invoices`.
 *
 * Reemplaza patrones tipo `select payments + reducir paidByInvoice`.
 */
export function useInvoicesWithBalance(filter: Filter = {}) {
  const {
    statuses = ["sent", "partial", "overdue"],
    dueFrom,
    dueTo,
    withBalanceOnly = true,
  } = filter;

  return useQuery({
    queryKey: invoiceKeys.withBalance({ statuses, dueFrom, dueTo, withBalanceOnly }),
    staleTime: 60_000,
    queryFn: async (): Promise<InvoiceWithBalance[]> => {
      // La vista no está tipada en types.ts (es runtime view); usamos cast controlado.
      let q = supabase
        .from("v_invoices_with_balance" as never)
        .select(
          "id, invoice_number, customer_name, customer_id, status, total, paid_amount, balance, due_date, issued_at, booking_id, moneda, tipo_cambio",
        )
        .in("status", statuses as string[]);
      if (dueFrom) q = q.gte("due_date", dueFrom);
      if (dueTo) q = q.lte("due_date", dueTo);
      if (withBalanceOnly) q = q.gt("balance", 0);

      const { data, error } = await q.order("due_date", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        invoice_number: r.invoice_number as string,
        customer_name: (r.customer_name as string | null) ?? null,
        customer_id: (r.customer_id as string | null) ?? null,
        status: r.status as string,
        total: Number(r.total),
        paid_amount: Number(r.paid_amount),
        balance: Number(r.balance),
        due_date: (r.due_date as string | null) ?? null,
        issued_at: r.issued_at as string,
        booking_id: (r.booking_id as string | null) ?? null,
        moneda: (r.moneda as string | null) ?? null,
        tipo_cambio: r.tipo_cambio == null ? null : Number(r.tipo_cambio),
      }));
    },
  });
}
