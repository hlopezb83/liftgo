import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

type Row = Database["public"]["Tables"]["supplier_bills"]["Row"];
type SupplierPayment = Database["public"]["Tables"]["supplier_payments"]["Row"];

export interface BillRepSummary {
  pending: number;
  received: number;
  rejected: number;
  total: number;
  worst: SupplierRepStatus; // pending > rejected > received > not_required
}

/** Pago aplicado a una factura de proveedor (para KPIs por fecha de pago). */
export interface BillPaymentRow {
  payment_date: string;
  amount: number;
}

export interface SupplierBillListItem extends Row {
  suppliers: { id: string; name: string } | null;
  rep_summary: BillRepSummary;
  // B-10: pagos reales de la factura — el KPI "pagado mes actual" se calcula
  // por payment_date, no por issue_date.
  payments: BillPaymentRow[];
}

export interface SupplierBillDetail extends Row {
  suppliers: { id: string; name: string; rfc: string | null } | null;
  payments: SupplierPayment[];
}


type PaymentRepRow = {
  bill_id: string;
  rep_required: boolean;
  rep_status: SupplierRepStatus;
  payment_date: string;
  amount: number;
};

function emptySummary(): BillRepSummary {
  return { pending: 0, received: 0, rejected: 0, total: 0, worst: "not_required" };
}

function worstOf(a: SupplierRepStatus, b: SupplierRepStatus): SupplierRepStatus {
  const rank: Record<SupplierRepStatus, number> = {
    pending: 4, rejected: 3, received: 2, not_required: 1,
  };
  return rank[a] >= rank[b] ? a : b;
}

function accumulatePayment(summaryMap: Map<string, BillRepSummary>, p: PaymentRepRow) {
  if (!p.rep_required) return;
  const cur = summaryMap.get(p.bill_id) ?? emptySummary();
  cur.total += 1;
  if (p.rep_status === "pending") cur.pending += 1;
  else if (p.rep_status === "received") cur.received += 1;
  else if (p.rep_status === "rejected") cur.rejected += 1;
  cur.worst = worstOf(cur.worst, p.rep_status);
  summaryMap.set(p.bill_id, cur);
}

// Tanda 2 P2-7: columnas explícitas (evita `select("*")`).
const BILL_LIST_COLUMNS =
  "id, bill_number, supplier_id, cfdi_uuid, folio, serie, issue_date, due_date, subtotal, tax_amount, retention_isr, retention_iva, total, currency, exchange_rate, payment_method_sat, payment_form_sat, cfdi_use, category, description, status, balance, xml_url, pdf_url, cfdi_xml_url, receptor_rfc, tipo_comprobante, coverage_start, coverage_end, notes, created_by, created_at, updated_at, approval_status, approved_by, approved_at, rejected_by, rejected_at, approval_notes, payment_in_progress_at, suppliers(id, name)";


async function fetchList(): Promise<SupplierBillListItem[]> {
  const fetchAllBills = async () => {
    const rows: SupplierBillListItem[] = [];
    for (let from = 0; ; from += LIST_PAGE_LIMIT) {
      const { data, error } = await supabase
        .from("supplier_bills")
        .select(BILL_LIST_COLUMNS)
        .order("issue_date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + LIST_PAGE_LIMIT - 1)
        .returns<SupplierBillListItem[]>();
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < LIST_PAGE_LIMIT) return rows;
    }
  };

  const fetchAllPayments = async () => {
    const rows: PaymentRepRow[] = [];
    for (let from = 0; ; from += LIST_PAGE_LIMIT) {
      const { data, error } = await supabase
        .from("supplier_payments")
        // Todos los pagos alimentan tanto el resumen REP como los KPIs.
        .select("id, bill_id, rep_required, rep_status, payment_date, amount")
        .order("payment_date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + LIST_PAGE_LIMIT - 1)
        .returns<Array<PaymentRepRow & { id: string }>>();
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < LIST_PAGE_LIMIT) return rows;
    }
  };

  const [bills, payments] = await Promise.all([fetchAllBills(), fetchAllPayments()]);

  const summaryMap = new Map<string, BillRepSummary>();
  const paymentsMap = new Map<string, BillPaymentRow[]>();
  for (const p of payments) {
    accumulatePayment(summaryMap, p);
    const list = paymentsMap.get(p.bill_id);
    const row: BillPaymentRow = { payment_date: p.payment_date, amount: p.amount };
    if (list) list.push(row);
    else paymentsMap.set(p.bill_id, [row]);
  }

  for (const b of bills) {
    b.rep_summary = summaryMap.get(b.id) ?? emptySummary();
    b.payments = paymentsMap.get(b.id) ?? [];
  }
  return bills;
}

async function fetchDetail(id: string): Promise<SupplierBillDetail | null> {
  const { data, error } = await supabase
    .from("supplier_bills")
    .select("*, suppliers(id, name, rfc), payments:supplier_payments(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const detail = data as unknown as SupplierBillDetail;
  detail.payments = (detail.payments ?? []).sort(
    (a, b) => b.payment_date.localeCompare(a.payment_date),
  );
  return detail;
}

export const supplierBillQueries = defineEntityQueries<
  "supplier_bills",
  SupplierBillListItem[],
  SupplierBillDetail | null
>("supplier_bills", {
  staleTime: 30_000,
  list: () => fetchList,
  detail: (id) => () => fetchDetail(id),
});

export const supplierBillKeys = supplierBillQueries.keys;
/** @deprecated usar `supplierBillKeys.all` (alias mantenido por retro-compatibilidad). */
export const SUPPLIER_BILLS_QK = supplierBillKeys.all;

export function useSupplierBills() {
  return useQuery(supplierBillQueries.list());
}
