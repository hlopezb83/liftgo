import { addDays } from "date-fns";
import { toYMD } from "@/lib/date/toYMD";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { nowMty } from "@/lib/utils";
import { useInvoicesWithBalance } from "./useInvoicesWithBalance";

export interface UpcomingInvoice {
  id: string;
  invoice_number: string;
  total: number;
  /** Saldo pendiente en moneda del documento. */
  balance: number;
  /** Saldo pendiente convertido a MXN (BL-1.1 R5). Null si falta tipo de cambio (H-2). */
  balance_mxn: number | null;
  /** H-2: factura en divisa sin tipo de cambio capturado. */
  fx_missing: boolean;
  moneda: string | null;
  tipo_cambio: number | null;
  due_date: string;
  customer_name: string | null;
}

/**
 * Facturas no pagadas con vencimiento dentro de los próximos 30 días.
 * Consume la vista única `v_invoices_with_balance` (paso 1 auditoría) y
 * expone `balance_mxn` para que los agregadores multi-moneda no sumen
 * USD como si fueran MXN.
 */
export function useUpcomingInvoices(enabled = true) {
  const today = todayKeyMty();
  const in30 = toYMD(addDays(nowMty(), 30)) ?? today;

  const query = useInvoicesWithBalance({
    statuses: ["sent", "partial"],
    dueFrom: today,
    dueTo: in30,
  }, enabled);

  return {
    ...query,
    data: query.data?.map<UpcomingInvoice>((inv) => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      total: inv.total,
      balance: inv.balance,
      balance_mxn: inv.balance_mxn,
      fx_missing: inv.fx_missing,
      moneda: inv.moneda,
      tipo_cambio: inv.tipo_cambio,
      due_date: inv.due_date as string,
      customer_name: inv.customer_name,
    })),
  };
}
