import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { nowMty } from "@/lib/utils";
import {
  buildPaidByInvoice,
  invoiceToItem,
  billToItem,
  type BillRow,
  type InvoiceRow,
  type PaymentRow,
} from "./cashFlowTransformers";
import { bucketByWeek, type CashFlowBucket, type CashFlowItem } from "./cashFlowUtils";

export interface CashFlowSettings {
  id: string | null;
  initialBalance: number;
  safetyBuffer: number;
}

const cashFlowSettingsQueries = defineEntityQueries("cash_flow_settings", {
  list: () => async (): Promise<CashFlowSettings> => {
    const { data, error } = await supabase
      .from("company_settings")
      .select("id, cash_initial_balance, cash_safety_buffer")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return {
      id: data?.id ?? null,
      initialBalance: Number(data?.cash_initial_balance ?? 0),
      safetyBuffer: Number(data?.cash_safety_buffer ?? 0),
    };
  },
  staleTime: 5 * 60_000,
});
void cashFlowSettingsQueries;

const ACTIVE_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;
const ACTIVE_BILL_STATUSES = ["pending", "partial", "overdue"] as const;

export interface CashFlowProjectionFilter extends Record<string, unknown> {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

export const cashFlowProjectionQueries = defineEntityQueries("cash_flow_projection", {
  list: (filter?: Readonly<Record<string, unknown>>) => async (): Promise<CashFlowBucket[]> => {
    const { weeks, initialBalance, safetyBuffer } = (filter ?? {}) as CashFlowProjectionFilter;
    // Tanda 3 P2-7: se acota `payments` a los invoice_id vigentes.
    // Antes se descargaba TODA la tabla `payments` (sin límite ni rango) solo
    // para construir `paidByInvoice` sobre las facturas activas listadas más
    // abajo. Ahora primero traemos las facturas/bills activas y filtramos los
    // pagos por su `invoice_id` → payload proporcional a lo que se proyecta.
    const [invRes, billRes] = await Promise.all([
      supabase.from("v_invoices_with_balance")
        .select("id, invoice_number, total, due_date, customer_name, moneda, tipo_cambio, credited_amount")
        .in("status", ACTIVE_INVOICE_STATUSES)
        .not("due_date", "is", null)
        .returns<InvoiceRow[]>(),
      supabase.from("supplier_bills")
        .select("id, bill_number, balance, due_date, currency, exchange_rate, suppliers(name)")
        .in("status", ACTIVE_BILL_STATUSES)
        .in("approval_status", ["not_required", "approved"])
        .not("due_date", "is", null)
        .returns<BillRow[]>(),
    ]);
    if (invRes.error) throw invRes.error;
    if (billRes.error) throw billRes.error;

    const activeInvoiceIds = (invRes.data ?? []).map((i) => i.id).filter(Boolean);
    let payments: PaymentRow[] = [];
    if (activeInvoiceIds.length > 0) {
      const payRes = await supabase.from("payments")
        .select("invoice_id, amount, currency, exchange_rate")
        .in("invoice_id", activeInvoiceIds)
        .returns<PaymentRow[]>();
      if (payRes.error) throw payRes.error;
      payments = payRes.data ?? [];
    }

    const paidByInvoice = buildPaidByInvoice(payments);
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
  staleTime: 60_000,
});

