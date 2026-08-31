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

/** F4: conteo HEAD de facturas activas sin fecha de vencimiento. */
async function countInvoicesWithoutDueDate(): Promise<number> {
  const res = await supabase.from("v_invoices_with_balance")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_INVOICE_STATUSES)
    .is("due_date", null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

/** F4: conteo HEAD de cuentas por pagar activas sin fecha de vencimiento. */
async function countBillsWithoutDueDate(): Promise<number> {
  const res = await supabase.from("supplier_bills")
    .select("id", { count: "exact", head: true })
    .in("status", ACTIVE_BILL_STATUSES)
    .in("approval_status", ["not_required", "approved"])
    .is("due_date", null);
  if (res.error) throw res.error;
  return res.count ?? 0;
}

export const cashFlowProjectionQueries = defineEntityQueries("cash_flow_projection", {
  list: (filter?: Readonly<Record<string, unknown>>) => async (): Promise<CashFlowProjectionResult> => {
    const { weeks, initialBalance, safetyBuffer } = (filter ?? {}) as CashFlowProjectionFilter;
    // Tanda 3 P2-7: se acota `payments` a los invoice_id vigentes.
    // Antes se descargaba TODA la tabla `payments` (sin límite ni rango) solo
    // para construir `paidByInvoice` sobre las facturas activas listadas más
    // abajo. Ahora primero traemos las facturas/bills activas y filtramos los
    // pagos por su `invoice_id` → payload proporcional a lo que se proyecta.
    const [invRes, billRes, noDueInvoices, noDueBills] = await Promise.all([
      supabase.from("v_invoices_with_balance")
        .select("id, invoice_number, total, due_date, customer_name, moneda, tipo_cambio, credited_amount, balance_mxn")
        .in("status", ACTIVE_INVOICE_STATUSES)
        .not("due_date", "is", null)
        .returns<InvoiceRow[]>(),
      supabase.from("supplier_bills")
        .select("id, bill_number, balance, due_date, currency, exchange_rate, suppliers(name)")
        .in("status", ACTIVE_BILL_STATUSES)
        .in("approval_status", ["not_required", "approved"])
        .not("due_date", "is", null)
        .returns<BillRow[]>(),
      countInvoicesWithoutDueDate(),
      countBillsWithoutDueDate(),
    ]);
    if (invRes.error) throw invRes.error;
    if (billRes.error) throw billRes.error;

    // A2-1: ya no se recalcula el saldo con `payments` en el cliente; la vista
    // `v_invoices_with_balance` expone `balance_mxn` FX-aware. Además ahorra
    // una query completa de pagos por cada carga de la proyección.
    const items: CashFlowItem[] = [];
    for (const inv of invRes.data ?? []) {
      const item = invoiceToItem(inv);
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
      excludedNoDueDate: noDueInvoices + noDueBills,
      excludedOutOfHorizon: countOutOfHorizon(items, buildWeekBuckets(today, weeks), todayYmd),
    };
  },
  staleTime: 60_000,
});

