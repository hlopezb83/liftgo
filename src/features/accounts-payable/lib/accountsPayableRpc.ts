import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { APPROVAL_STATUSES, EXPENSE_CATEGORY_LABELS, SUPPLIER_BILL_STATUSES, type ExpenseCategory } from "./supplierBillConstants";

/** SQL contract: 20260928140000_accounts_payable_server_queries.sql.
 * Nullable filters are accepted by SQL, but missing from the generated Args. */
interface BillPageRpcArgs {
  p_search: string | null; p_status: string; p_supplier_id: string | null;
  p_category: string; p_month: string | null; p_approval: string; p_rep: string;
  p_page: number; p_page_size: number; p_sort_by: string; p_sort_desc: boolean;
}
type BillPageRpc = (name: "get_supplier_bills_page", args: BillPageRpcArgs) => PromiseLike<{
  data: unknown; error: { message: string; code?: string } | null;
}>;

export function callAccountsPayableBillPageRpc(args: BillPageRpcArgs) {
  const rpc = supabase.rpc.bind(supabase) as unknown as BillPageRpc;
  return rpc("get_supplier_bills_page", args);
}

const finiteAmount = z.number().finite();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Validate the fields this page consumes. SQL does not return discount,
// organization_id, payment details or REP totals: never invent them here.
const billSchema = z.object({
  id: z.uuid(), bill_number: z.string().min(1), supplier_id: z.uuid().nullable(),
  suppliers: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  issue_date: z.iso.date(), due_date: z.iso.date().nullable(),
  subtotal: finiteAmount, tax_amount: finiteAmount,
  retention_isr: finiteAmount, retention_iva: finiteAmount,
  total: finiteAmount.nonnegative(), balance: finiteAmount,
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  // Missing/zero/placeholder FX must remain visible as missing, not become MXN.
  exchange_rate: finiteAmount.nullable(),
  status: z.enum(SUPPLIER_BILL_STATUSES), approval_status: z.enum(APPROVAL_STATUSES),
  category: z.enum(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).nullable(),
});
export type AccountsPayableBillRow = z.infer<typeof billSchema>;
const pageSchema = z.object({ items: z.array(billSchema), totalCount: count });
export type AccountsPayableBillPage = z.infer<typeof pageSchema>;

export function parseAccountsPayableBillPage(value: unknown, pageIndex: number, pageSize: number): AccountsPayableBillPage {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error("El servidor devolvió una página de CxP inválida o incompleta");
  const page = parsed.data;
  // This endpoint uses OFFSET, not the clamped-page contract of inventory.
  // An out-of-range page is empty; its total lets the existing UI request the last page.
  const expectedLength = Math.max(0, Math.min(pageSize, page.totalCount - pageIndex * pageSize));
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 100000 ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      page.items.length !== expectedLength || new Set(page.items.map((item) => item.id)).size !== page.items.length ||
      page.items.some((item) => item.suppliers !== null && item.suppliers.id !== item.supplier_id)) {
    throw new Error("No se pudo verificar el total y la página de CxP. Reintenta la consulta.");
  }
  return page;
}

const kpisSchema = z.object({
  totalPendiente: finiteAmount.nonnegative(), totalVencido: finiteAmount.nonnegative(),
  totalPorVencer: finiteAmount.nonnegative(), pagadoMesActual: finiteAmount.nonnegative(),
  totalPorAprobar: finiteAmount.nonnegative(), countPorAprobar: count,
  repPendientes: count, fxMissingCount: count,
});
const summarySchema = z.object({
  kpis: kpisSchema,
  availableMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
});

export function parseAccountsPayableSummary(value: unknown) {
  const parsed = summarySchema.safeParse(value);
  if (!parsed.success) throw new Error("El servidor devolvió un resumen de CxP inválido o incompleto");
  const { kpis, availableMonths } = parsed.data;
  // Overdue and due-soon are disjoint subsets; allow only floating-point rounding.
  const tolerance = Number.EPSILON * 8 * Math.max(1, kpis.totalPendiente);
  if (kpis.totalVencido + kpis.totalPorVencer - kpis.totalPendiente > tolerance ||
      (kpis.countPorAprobar === 0 && kpis.totalPorAprobar !== 0) ||
      (availableMonths.length === 0 && Object.values(kpis).some((value) => value !== 0)) ||
      availableMonths.some((month, index) => index > 0 && month >= availableMonths[index - 1])) {
    throw new Error("No se pudieron verificar los totales y meses de CxP. Reintenta la consulta.");
  }
  return parsed.data;
}
