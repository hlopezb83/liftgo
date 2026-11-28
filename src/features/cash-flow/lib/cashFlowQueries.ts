import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import { nowMty } from "@/lib/utils";
import {
  billToItem,
  invoiceToItem,
  recurringBookingItems,
  recurringCoverageReviewCount,
  type BillRow,
  type InvoiceRow,
  type RecurringBookingRow,
} from "./cashFlowTransformers";
import {
  bucketByWeek,
  buildWeekBuckets,
  countOutOfHorizon,
  type CashFlowItem,
} from "./cashFlowUtils";
import type {
  CashFlowProjectionFilter,
  CashFlowProjectionResult,
} from "./queryKeys";

const ACTIVE_INVOICE_STATUSES = ["sent", "partial", "overdue"] as const;
const ACTIVE_BILL_STATUSES = ["pending", "partial", "overdue"] as const;

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
    const [invRes, billRes, bookingRes, noDueInvoices, noDueBills] = await Promise.all([
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
      callRpc<RecurringBookingRow[]>("get_cash_flow_recurring_bookings"),
      countInvoicesWithoutDueDate(),
      countBillsWithoutDueDate(),
    ]);
    if (invRes.error) throw invRes.error;
    if (billRes.error) throw billRes.error;

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
    const horizonBuckets = buildWeekBuckets(today, weeks);
    const horizonEnd = horizonBuckets[horizonBuckets.length - 1]?.endDate ?? format(today, "yyyy-MM-dd");
    const todayYmd = format(today, "yyyy-MM-dd");
    items.push(...recurringBookingItems(bookingRes ?? [], todayYmd, horizonEnd));

    const buckets = bucketByWeek(items, today, weeks, initialBalance, safetyBuffer);
    return {
      buckets,
      excludedNoDueDate: noDueInvoices + noDueBills,
      excludedOutOfHorizon: countOutOfHorizon(items, buildWeekBuckets(today, weeks), todayYmd),
      excludedRecurringCoverage: recurringCoverageReviewCount(bookingRes ?? []),
    };
  },
  staleTime: 60_000,
});
