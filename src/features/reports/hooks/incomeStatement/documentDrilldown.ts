import { formatStatementAmount } from "./statementAmountPresentation";
import type { AccountingBasis } from "./types";

export interface StatementDocumentSelection {
  kind: string;
  label: string | null;
  title: string;
  months: string[];
  expectedTotal: number;
}
export interface StatementDocumentScope {
  startDate: string;
  endDate: string;
  accountingBasis: AccountingBasis;
}
export interface StatementDocument {
  row_key: string;
  source_type:
    | "invoice"
    | "payment"
    | "credit_note"
    | "supplier_bill"
    | "supplier_payment"
    | "operating_expense";
  document_id: string;
  payment_id: string | null;
  invoice_id: string | null;
  folio: string | null;
  document_date: string;
  event_date: string;
  month_key: string;
  currency: string;
  amount: number;
  label: string;
  coverage_start: string | null;
  coverage_end: string | null;
}
export interface StatementDocumentPage {
  items: StatementDocument[];
  total_count: number;
  total_amount: number;
  rounding_adjustment: number;
  limit: number;
  offset: number;
  currency: "MXN";
  basis: AccountingBasis;
}

const KINDS: Record<string, string> = {
  rentalBooked: "rental_booked",
  rentalUnbooked: "rental_unbooked",
  sales: "sales",
  otherServices: "other_services",
  damageRecovery: "damage_recovery",
  creditNotes: "credit_notes",
};
export function documentKind(breakdownKey: string | undefined): string | null {
  if (!breakdownKey) return null;
  return (
    KINDS[breakdownKey] ??
    (breakdownKey.startsWith("exp:") ? breakdownKey : null)
  );
}
export function canOpenStatementDocuments(
  kind: string,
  permissions: {
    financial: boolean;
    reports: boolean;
    invoices: boolean;
    supplierBills: boolean;
    expenses: boolean;
  },
) {
  if (!permissions.financial || !permissions.reports) return false;
  if (kind.startsWith("exp:"))
    return permissions.supplierBills && permissions.expenses;
  // The invoice detail owns payment history; there is no separate Pagos module.
  return permissions.invoices;
}
export function documentTotalMatches(
  expected: number,
  actual: number,
): boolean {
  return (
    Number.isFinite(expected) &&
    Number.isFinite(actual) &&
    formatStatementAmount(expected) === formatStatementAmount(actual)
  );
}
export function statementDocumentHref(
  document: StatementDocument,
): string | null {
  if (
    ["invoice", "payment", "credit_note"].includes(document.source_type) &&
    document.invoice_id
  ) {
    return `/invoices/${encodeURIComponent(document.invoice_id)}`;
  }
  return null;
}
