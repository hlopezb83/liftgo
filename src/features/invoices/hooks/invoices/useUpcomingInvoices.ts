import { addDays } from "date-fns";
import { nowMty } from "@/lib/utils";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { toYMD } from "@/lib/date/toYMD";
import { useInvoicesWithBalance } from "./useInvoicesWithBalance";

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
 * Consume la vista única `v_invoices_with_balance` (paso 1 auditoría).
 */
export function useUpcomingInvoices() {
  const today = todayKeyMty();
  const in30 = toYMD(addDays(nowMty(), 30)) ?? today;

  const query = useInvoicesWithBalance({
    statuses: ["sent", "partial"],
    dueFrom: today,
    dueTo: in30,
  });

  return {
    ...query,
    data: query.data?.map<UpcomingInvoice>((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      total: inv.total,
      balance: inv.balance,
      due_date: inv.due_date as string,
      customer_name: inv.customer_name,
    })),
  };
}
