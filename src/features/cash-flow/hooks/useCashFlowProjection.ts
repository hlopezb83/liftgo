import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowMty } from "@/lib/utils";
import {
  buildPaidByInvoice,
  invoiceToItem,
  billToItem,
  type BillRow,
  type InvoiceRow,
  type PaymentRow,
} from "../lib/cashFlowTransformers";
import { bucketByWeek, type CashFlowBucket, type CashFlowItem } from "../lib/cashFlowUtils";

interface Args {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

const ACTIVE_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;
const ACTIVE_BILL_STATUSES = ["pending", "partial", "overdue"] as const;

export function useCashFlowProjection({ weeks, initialBalance, safetyBuffer }: Args) {
  return useQuery({
    queryKey: ["cash_flow_projection", weeks, initialBalance, safetyBuffer],
    staleTime: 60_000,
    queryFn: async (): Promise<CashFlowBucket[]> => {
      const [invRes, billRes, payRes] = await Promise.all([
        supabase.from("invoices")
          .select("id, invoice_number, total, due_date, customer_name, moneda, tipo_cambio")
          .in("status", ACTIVE_INVOICE_STATUSES)
          .not("due_date", "is", null)
          .returns<InvoiceRow[]>(),
        supabase.from("supplier_bills")
          .select("id, bill_number, balance, due_date, currency, exchange_rate, suppliers(name)")
          .in("status", ACTIVE_BILL_STATUSES)
          .in("approval_status", ["not_required", "approved"])
          .not("due_date", "is", null)
          .returns<BillRow[]>(),
        supabase.from("payments")
          .select("invoice_id, amount, currency, exchange_rate")
          .returns<PaymentRow[]>(),
      ]);
      if (invRes.error) throw invRes.error;
      if (billRes.error) throw billRes.error;
      if (payRes.error) throw payRes.error;

      const paidByInvoice = buildPaidByInvoice(payRes.data ?? []);
      const items: CashFlowItem[] = [];
      for (const inv of invRes.data ?? []) {
        const item = invoiceToItem(inv, paidByInvoice);
        if (item) items.push(item);
      }
      for (const b of billRes.data ?? []) {
        const item = billToItem(b);
        if (item) items.push(item);
      }
      return bucketByWeek(items, nowMty(), weeks, initialBalance, safetyBuffer);
    },
  });
}
