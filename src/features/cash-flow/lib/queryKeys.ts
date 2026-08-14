import { format } from "date-fns";
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
import {
  bucketByWeek,
  buildWeekBuckets,
  countOutOfHorizon,
  type CashFlowBucket,
  type CashFlowItem,
} from "./cashFlowUtils";

export interface CashFlowSettings {
  id: string | null;
  initialBalance: number;
  safetyBuffer: number;
}

// Nota: `cashFlowSettingsQueries` se removió en v7.236.5 tras no tener
// consumidores (Knip). La proyección lee `initialBalance`/`safetyBuffer`
// directamente desde `CashFlowProjectionFilter`.





const ACTIVE_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;
const ACTIVE_BILL_STATUSES = ["pending", "partial", "overdue"] as const;

export interface CashFlowProjectionFilter extends Record<string, unknown> {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

export interface CashFlowProjectionResult {
  buckets: CashFlowBucket[];
  /**
   * F4: documentos activos SIN fecha de vencimiento. La query los excluye
   * (`.not("due_date","is",null)`) y antes desaparecían en silencio; el conteo
   * se expone para avisar en la UI (patrón "excluir + avisar").
   */
  excludedNoDueDate: number;
  /** Documentos cuyo vencimiento cae fuera del horizonte seleccionado. */
  excludedOutOfHorizon: number;
}

export const cashFlowProjectionQueries = defineEntityQueries("cash_flow_projection", {
  list: (filter?: Readonly<Record<string, unknown>>) => async (): Promise<CashFlowProjectionResult> => {
    const { weeks, initialBalance, safetyBuffer } = (filter ?? {}) as CashFlowProjectionFilter;
    // Tanda 3 P2-7: se acota `payments` a los invoice_id vigentes.
    // Antes se descargaba TODA la tabla `payments` (sin límite ni rango) solo
    // para construir `paidByInvoice` sobre las facturas activas listadas más
    // abajo. Ahora primero traemos las facturas/bills activas y filtramos los
    // pagos por su `invoice_id` → payload proporcional a lo que se proyecta.
    const [invRes, billRes, invNoDueRes, billNoDueRes] = await Promise.all([
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
      supabase.from("v_invoices_with_balance")
        .select("id", { count: "exact", head: true })
        .in("status", ACTIVE_INVOICE_STATUSES)
        .is("due_date", null),
      supabase.from("supplier_bills")
        .select("id", { count: "exact", head: true })
        .in("status", ACTIVE_BILL_STATUSES)
        .in("approval_status", ["not_required", "approved"])
        .is("due_date", null),
    ]);
    if (invRes.error) throw invRes.error;
    if (billRes.error) throw billRes.error;
    if (invNoDueRes.error) throw invNoDueRes.error;
    if (billNoDueRes.error) throw billNoDueRes.error;

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
    const today = nowMty();
    const buckets = bucketByWeek(items, today, weeks, initialBalance, safetyBuffer);
    const todayYmd = format(today, "yyyy-MM-dd");
    return {
      buckets,
      excludedNoDueDate: (invNoDueRes.count ?? 0) + (billNoDueRes.count ?? 0),
      excludedOutOfHorizon: countOutOfHorizon(items, buildWeekBuckets(today, weeks), todayYmd),
    };
  },
  staleTime: 60_000,
});

