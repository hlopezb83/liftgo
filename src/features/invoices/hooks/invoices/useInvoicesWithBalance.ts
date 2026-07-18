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
  /** Paginación (PERF-001): límite de filas y offset. Undefined => sin paginar. */
  limit?: number;
  offset?: number;
}

function buildInvoicesWithBalanceQuery(filter: Filter) {
  const {
    statuses = ["sent", "partial", "overdue"],
    dueFrom,
    dueTo,
    withBalanceOnly = true,
    limit,
    offset,
  } = filter;

  return queryOptions({
    queryKey: invoiceKeys.withBalance({ statuses, dueFrom, dueTo, withBalanceOnly, limit, offset }),
    staleTime: 60_000,
    queryFn: async (): Promise<InvoiceWithBalance[]> => {
      // SEC-005 + PERF-001: RPC parametrizada que filtra y pagina en servidor.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
        "list_invoices_with_balance",
        {
          p_statuses: statuses as string[],
          p_due_from: dueFrom ?? null,
          p_due_to: dueTo ?? null,
          p_with_balance_only: withBalanceOnly,
          p_limit: limit ?? null,
          p_offset: offset ?? 0,
        },
      );
      if (error) throw error;

      const rows = (data ?? []) as Record<string, unknown>[];

      return rows.map((r) => ({
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
 * SEC-005 + PERF-001: consume el RPC SECURITY DEFINER
 * `list_invoices_with_balance(statuses, due_from, due_to, with_balance_only, limit, offset)`
 * que aplica filtros por rol (customers solo ven sus propias facturas) y
 * empuja el resto de filtros + paginación al servidor.
 */
export function useInvoicesWithBalance(filter: Filter = {}) {
  return useQuery(buildInvoicesWithBalanceQuery(filter));
}
