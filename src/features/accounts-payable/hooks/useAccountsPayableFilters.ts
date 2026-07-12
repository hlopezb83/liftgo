import { useState } from "react";
import type { SupplierBillListItem } from "./useSupplierBills";
import type {
  SupplierBillStatus,
  SupplierBillApprovalStatus,
  ExpenseCategory,
} from "../lib/supplierBillConstants";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

interface FilterState {
  search: string;
  status: SupplierBillStatus | "all";
  supplierId: string | "all";
  category: ExpenseCategory | "all";
  month: string;
  approval: SupplierBillApprovalStatus | "all";
  rep: SupplierRepStatus | "all";
}

const INITIAL: FilterState = {
  search: "",
  status: "all",
  supplierId: "all",
  category: "all",
  month: "all",
  approval: "all",
  rep: "all",
};

function matchesRep(bill: SupplierBillListItem, rep: FilterState["rep"]): boolean {
  if (rep === "all") return true;
  const s = bill.rep_summary;
  if (rep === "not_required") return s.total === 0;
  if (rep === "pending") return s.pending > 0;
  if (rep === "rejected") return s.rejected > 0;
  if (rep === "received") return s.total > 0 && s.received === s.total;
  return true;
}

function matchesSearch(bill: SupplierBillListItem, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  const hay = [
    bill.bill_number,
    bill.cfdi_uuid ?? "",
    bill.folio ?? "",
    bill.description ?? "",
    bill.suppliers?.name ?? "",
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function matches(bill: SupplierBillListItem, f: FilterState): boolean {
  return (
    (f.status === "all" || bill.status === f.status) &&
    (f.supplierId === "all" || bill.supplier_id === f.supplierId) &&
    (f.category === "all" || bill.category === f.category) &&
    (f.month === "all" || bill.issue_date.startsWith(f.month)) &&
    (f.approval === "all" || bill.approval_status === f.approval) &&
    matchesRep(bill, f.rep) &&
    matchesSearch(bill, f.search)
  );
}

export function useAccountsPayableFilters(bills: SupplierBillListItem[]) {
  const [state, setState] = useState<FilterState>(INITIAL);

  const filtered = bills.filter((b) => matches(b, state));

  const monthsSet = new Set<string>();
  for (const b of bills) monthsSet.add(b.issue_date.slice(0, 7));
  const availableMonths = Array.from(monthsSet).sort().reverse();

  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => {
    setState((s) => ({ ...s, [k]: v }));
  };

  const reset = () => setState(INITIAL);

  const hasActive = JSON.stringify(state) !== JSON.stringify(INITIAL);

  return { ...state, filtered, availableMonths, set, reset, hasActive };
}
