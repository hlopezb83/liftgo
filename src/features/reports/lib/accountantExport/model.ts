import type { Database } from "@/integrations/supabase/types";
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export const invoiceFields = ["id", "organization_id", "invoice_number", "issued_at", "due_date", "customer_name", "receptor_razon_social", "receptor_rfc", "cfdi_uuid", "serie", "folio", "moneda", "tipo_cambio", "subtotal", "tax_amount", "tax_rate", "total", "status", "cfdi_status", "cancellation_status", "cancelled_at", "substitution_uuid", "facturapi_env", "is_e2e", "metodo_pago", "forma_pago", "uso_cfdi", "billing_period_start", "billing_period_end", "updated_at"] as const satisfies readonly (keyof Row<"invoices">)[];
export const creditFields = ["id", "organization_id", "credit_note_number", "invoice_id", "issued_at", "currency", "subtotal", "tax_amount", "tax_rate", "total", "cfdi_uuid", "status", "cfdi_status", "cancellation_status", "cancelled_at", "substitution_uuid", "motive", "updated_at"] as const satisfies readonly (keyof Row<"credit_notes">)[];
export const paymentFields = ["id", "organization_id", "invoice_id", "payment_date", "amount", "currency", "exchange_rate", "amount_mxn", "payment_method", "payment_form_sat", "reference_number", "installment_number", "prior_balance", "is_e2e", "rep_number", "rep_folio", "rep_cfdi_uuid", "rep_cfdi_status", "rep_cancellation_status", "rep_cancelled_at", "rep_substitution_uuid"] as const satisfies readonly (keyof Row<"payments">)[];
export const billFields = ["id", "organization_id", "bill_number", "supplier_id", "issue_date", "due_date", "cfdi_uuid", "serie", "folio", "currency", "exchange_rate", "subtotal", "discount", "tax_amount", "retention_isr", "retention_iva", "total", "status", "approval_status", "category", "description", "coverage_start", "coverage_end", "payment_method_sat", "payment_form_sat", "cfdi_use", "tipo_comprobante", "legacy_expense_id", "updated_at"] as const satisfies readonly (keyof Row<"supplier_bills">)[];
export const supplierPaymentFields = ["id", "organization_id", "bill_id", "payment_date", "amount", "payment_method", "reference", "rep_required", "rep_status", "rep_cfdi_uuid", "rep_received_at"] as const satisfies readonly (keyof Row<"supplier_payments">)[];
export const expenseFields = ["id", "organization_id", "expense_date", "amount", "category", "description", "supplier_id", "supplier_bill_id", "cfdi_uuid", "updated_at"] as const satisfies readonly (keyof Row<"operating_expenses">)[];
export type Invoice = Pick<Row<"invoices">, typeof invoiceFields[number]> & Partial<Pick<Row<"invoices">, "cfdi_xml" | "cfdi_xml_url" | "cfdi_pdf_url">>;
export type Credit = Pick<Row<"credit_notes">, typeof creditFields[number]> & Partial<Pick<Row<"credit_notes">, "cfdi_xml_url" | "cfdi_pdf_url">>;
export type Payment = Pick<Row<"payments">, typeof paymentFields[number]> & Partial<Pick<Row<"payments">, "rep_xml_url" | "rep_pdf_url">>;
export type Bill = Pick<Row<"supplier_bills">, typeof billFields[number]> & Partial<Pick<Row<"supplier_bills">, "cfdi_xml_url" | "xml_url" | "pdf_url">> & { supplier?: { id: string; name: string; rfc: string | null; organization_id: string | null } | null };
export type SupplierPayment = Pick<Row<"supplier_payments">, typeof supplierPaymentFields[number]> & Partial<Pick<Row<"supplier_payments">, "rep_xml_url" | "rep_pdf_url">>;
export type Expense = Pick<Row<"operating_expenses">, typeof expenseFields[number]>;
export type Sections = { sales: boolean; purchases: boolean; expenses: boolean };
export interface ExportOptions {
  organizationId: string;
  start: string;
  end: string;
  sections: Sections;
  includeDrafts: boolean;
  includeTest: boolean;
  includeDocuments?: boolean;
}
export interface ExportData {
  invoices: Invoice[];
  credits: Credit[];
  payments: Payment[];
  bills: Bill[];
  supplierPayments: SupplierPayment[];
  expenses: Expense[];
  invoiceReferences: Invoice[];
  billReferences: Bill[];
  startedAt: string;
  finishedAt: string;
}
export type Cell = string | number | boolean | null;
export type ExportRow = Record<string, Cell>;
export interface ExportSheet { name: string; rows: ExportRow[]; headers?: string[] }
export function assertOptions(options: ExportOptions, permissions: Sections) {
  if (!/^[0-9a-f-]{36}$/i.test(options.organizationId)) throw new Error("Empresa no verificada.");
  const civil = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!civil(options.start) || !civil(options.end) || options.start > options.end) throw new Error("El rango de fechas no es válido.");
  const keys = Object.keys(options.sections) as (keyof Sections)[];
  if (!keys.some((key) => options.sections[key])) throw new Error("Selecciona al menos una sección.");
  if (keys.some((key) => options.sections[key] && !permissions[key])) throw new Error("No tienes permiso para una sección solicitada.");
}
