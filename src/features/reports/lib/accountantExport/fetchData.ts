import { supabase } from "@/integrations/supabase/client";
import { assertOptions, billFields, creditFields, expenseFields, invoiceFields, paymentFields, supplierPaymentFields, type Bill, type Credit, type Expense, type ExportData, type ExportOptions, type Invoice, type Payment, type Sections, type SupplierPayment } from "./model";
import { collectPages } from "./pagination";

type Source = "invoices" | "credit_notes" | "payments" | "supplier_bills" | "supplier_payments" | "operating_expenses";
const documentFields: Partial<Record<Source, readonly string[]>> = {
  invoices: ["cfdi_xml", "cfdi_xml_url", "cfdi_pdf_url"],
  credit_notes: ["cfdi_xml_url", "cfdi_pdf_url"], payments: ["rep_xml_url", "rep_pdf_url"],
  supplier_bills: ["cfdi_xml_url", "xml_url", "pdf_url"], supplier_payments: ["rep_xml_url", "rep_pdf_url"],
};
const selectedFields = (table: Source, fields: readonly string[], options: ExportOptions) =>
  [...fields, ...(options.includeDocuments ? documentFields[table] ?? [] : [])].join(",");
interface ScopedRow { id: string; organization_id: string | null }
type Joined<T> = T & { scope?: { organization_id: string } };

async function readPeriod<T extends ScopedRow>(
  table: Source, fields: readonly string[], date: string, options: ExportOptions,
  signal: AbortSignal, parent?: "invoices" | "supplier_bills",
): Promise<T[]> {
  const columns = `${selectedFields(table, fields, options)}${table === "supplier_bills" ? ",supplier:suppliers(id,name,rfc,organization_id)" : ""}${parent ? `,scope:${parent}!inner(organization_id)` : ""}`;
  const rows = await collectPages<Joined<T>>(async (after, size) => {
    let query = supabase.from(table).select(columns).gte(date, options.start).lte(date, options.end)
      .order("id", { ascending: true }).limit(size).abortSignal(signal);
    if (parent) {
      query = query.eq("scope.organization_id", options.organizationId)
        .or(`organization_id.eq.${options.organizationId},organization_id.is.null`);
    } else query = query.eq("organization_id", options.organizationId);
    if (table === "supplier_bills") query = query.eq("supplier.organization_id", options.organizationId);
    if (after) query = query.gt("id", after);
    return await query.returns<Joined<T>[]>();
  }, signal);
  return rows.map(({ scope, ...row }) => {
    if (row.organization_id !== options.organizationId && !(row.organization_id === null && scope?.organization_id === options.organizationId)) {
      throw new Error("No se pudo verificar la empresa de un movimiento. Exportación detenida.");
    }
    if (parent && scope?.organization_id !== options.organizationId) throw new Error("Documento relacionado no autorizado.");
    return row as T;
  });
}

async function references<T extends ScopedRow>(
  table: "invoices" | "supplier_bills", fields: readonly string[], ids: string[],
  options: ExportOptions, signal: AbortSignal,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const result: T[] = [];
  for (let i = 0; i < unique.length; i += 100) {
    signal.throwIfAborted();
    const part = unique.slice(i, i + 100);
    let query = supabase.from(table).select(`${selectedFields(table, fields, options)}${table === "supplier_bills" ? ",supplier:suppliers(id,name,rfc,organization_id)" : ""}`)
      .eq("organization_id", options.organizationId).in("id", part).order("id").abortSignal(signal);
    if (table === "supplier_bills") query = query.eq("supplier.organization_id", options.organizationId);
    const { data, error } = await query.returns<T[]>();
    signal.throwIfAborted();
    if (error) throw error;
    if (data?.length !== part.length || data.some((row) => row.organization_id !== options.organizationId || !part.includes(row.id))) {
      throw new Error("Faltan documentos relacionados autorizados. No se generó un paquete incompleto.");
    }
    result.push(...data);
  }
  return result;
}

/** Read-only, user-session/RLS queries. No PAC calls, RPC mutations or cached fiscal downloads. */
export async function fetchAccountantData(options: ExportOptions, permissions: Sections, signal: AbortSignal): Promise<ExportData> {
  assertOptions(options, permissions);
  const result: ExportData = {
    invoices: [], credits: [], payments: [], bills: [], supplierPayments: [], expenses: [],
    invoiceReferences: [], billReferences: [], startedAt: new Date().toISOString(), finishedAt: "",
  };
  // Sequential reads bound resource use. Every query carries explicit tenant scope.
  if (options.sections.sales) {
    result.invoices = await readPeriod<Invoice>("invoices", invoiceFields, "issued_at", options, signal);
    result.credits = await readPeriod<Credit>("credit_notes", creditFields, "issued_at", options, signal);
    result.payments = await readPeriod<Payment>("payments", paymentFields, "payment_date", options, signal, "invoices");
    const known = new Set(result.invoices.map((row) => row.id));
    result.invoiceReferences = await references<Invoice>("invoices", invoiceFields,
      [...result.credits.map((row) => row.invoice_id), ...result.payments.map((row) => row.invoice_id)].filter((id) => !known.has(id)), options, signal);
  }
  if (options.sections.purchases) {
    result.bills = await readPeriod<Bill>("supplier_bills", billFields, "issue_date", options, signal);
    result.supplierPayments = await readPeriod<SupplierPayment>("supplier_payments", supplierPaymentFields, "payment_date", options, signal, "supplier_bills");
    const known = new Set(result.bills.map((row) => row.id));
    result.billReferences = await references<Bill>("supplier_bills", billFields,
      result.supplierPayments.map((row) => row.bill_id).filter((id) => !known.has(id)), options, signal);
  }
  if (options.sections.expenses) {
    // Legacy null-company expenses cannot be safely assigned by supplier/name.
    // They are deliberately not inferred; Control describes this coverage boundary.
    result.expenses = await readPeriod<Expense>("operating_expenses", expenseFields, "expense_date", options, signal);
  }
  signal.throwIfAborted();
  result.finishedAt = new Date().toISOString();
  return result;
}
