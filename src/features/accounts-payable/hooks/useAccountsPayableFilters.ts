import { useMemo, useState, useCallback } from "react";
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

function matches(bill: SupplierBillListItem, f: FilterState): boolean {
  if (f.status !== "all" && bill.status !== f.status) return false;
  if (f.supplierId !== "all" && bill.supplier_id !== f.supplierId) return false;
  if (f.category !== "all" && bill.category !== f.category) return false;
  if (f.month !== "all" && !bill.issue_date.startsWith(f.month)) return false;
  if (f.approval !== "all" && bill.approval_status !== f.approval) return false;
  if (!matchesRep(bill, f.rep)) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [
      bill.bill_number,
      bill.cfdi_uuid ?? "",
      bill.folio ?? "",
      bill.description ?? "",
      bill.suppliers?.name ?? "",
    ].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function useAccountsPayableFilters(bills: SupplierBillListItem[]) {
  const [state, setState] = useState<FilterState>(INITIAL);

  const filtered = useMemo(() => bills.filter((b) => matches(b, state)), [bills, state]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const b of bills) set.add(b.issue_date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [bills]);

  const set = useCallback(<K extends keyof FilterState>(k: K, v: FilterState[K]) => {
    setState((s) => ({ ...s, [k]: v }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const hasActive = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(INITIAL),
    [state],
  );

  return { ...state, filtered, availableMonths, set, reset, hasActive };
}
