import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";

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

function buildInvoicesWithBalanceQuery(filter: Filter) {
  const {
    statuses = ["sent", "partial", "overdue"],
    dueFrom,
    dueTo,
    withBalanceOnly = true,
  } = filter;

  return queryOptions({
    queryKey: invoiceKeys.withBalance({ statuses, dueFrom, dueTo, withBalanceOnly }),
    staleTime: 60_000,
    queryFn: async (): Promise<InvoiceWithBalance[]> => {
      // SEC-005: la vista v_invoices_with_balance ya no es legible directamente.
      // Consumimos el RPC SECURITY DEFINER `list_invoices_with_balance`
      // que filtra por rol del caller (customers → solo sus facturas).
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "list_invoices_with_balance",
      );
      if (error) throw error;

      const rows = (data ?? []) as Record<string, unknown>[];
      const statusSet = new Set(statuses);

      return rows
        .filter((r) => statusSet.has(r.status as string))
        .filter((r) => (dueFrom ? String(r.due_date ?? "") >= dueFrom : true))
        .filter((r) => (dueTo ? String(r.due_date ?? "") <= dueTo : true))
        .filter((r) => (withBalanceOnly ? Number(r.balance) > 0 : true))
        .sort((a, b) => String(a.due_date ?? "").localeCompare(String(b.due_date ?? "")))
        .map((r) => ({
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

/**
 * Fuente única de verdad para "facturas + saldo".
 *
 * Desde SEC-005: consume el RPC SECURITY DEFINER `list_invoices_with_balance`,
 * que aplica filtros por rol (customers solo ven sus propias facturas).
 * Los filtros por estado / rango / saldo se aplican en cliente sobre el set
 * devuelto para mantener la API previa; la vista subyacente sigue calculando
 * `paid_amount` y `balance = total - paid_amount`.
 */
export function useInvoicesWithBalance(filter: Filter = {}) {
  return useQuery(buildInvoicesWithBalanceQuery(filter));
}
