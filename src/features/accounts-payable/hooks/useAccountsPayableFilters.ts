import { useMemo } from "react";
import { useTableFilters } from "@/hooks/filters/useTableFilters";
import type { SupplierBillListItem } from "./useSupplierBills";
import type {
  SupplierBillStatus,
  SupplierBillApprovalStatus,
  ExpenseCategory,
} from "../lib/supplierBillConstants";
import type { SupplierRepStatus } from "../lib/supplierRepConstants";

/**
 * Filtros de Cuentas por Pagar.
 *
 * Persisten en URL vía `useTableFilters` (v7.62.0). API compatible con la
 * versión previa basada en `useState`: mismos nombres (`search`, `status`,
 * `supplierId`, `category`, `month`, `approval`, `rep`) y helpers
 * (`set`, `reset`, `hasActive`, `filtered`, `filterKey`).
 */
function matchesRep(bill: SupplierBillListItem, rep: string): boolean {
  if (rep === "all") return true;
  const s = bill.rep_summary;
  if (rep === "not_required") return s.total === 0;
  if (rep === "pending") return s.pending > 0;
  if (rep === "rejected") return s.rejected > 0;
  if (rep === "received") return s.total > 0 && s.received === s.total;
  return true;
}

const REP_OPTIONS = ["not_required", "pending", "rejected", "received"] as const;

export function useAccountsPayableFilters(bills: SupplierBillListItem[]) {
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    for (const b of bills) monthsSet.add(b.issue_date.slice(0, 7));
    return Array.from(monthsSet).sort().reverse();
  }, [bills]);

  const supplierOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of bills) if (b.supplier_id) set.add(b.supplier_id);
    return Array.from(set);
  }, [bills]);

  // Nota: en modo cliente puro delegamos casi todo el filtrado a
  // useTableFilters. `rep` no encaja en las facetas declarativas porque
  // consulta un objeto derivado (`rep_summary`), así que lo aplicamos aparte.
  const {
    values,
    set: setRaw,
    reset,
    hasActive: hasActiveBase,
    filtered: filteredByFacets,
    filterKey: baseKey,
  } = useTableFilters<SupplierBillListItem, {
    search: { type: "text"; fields: (keyof SupplierBillListItem)[]; accessors: ((b: SupplierBillListItem) => string)[] };
    status: { type: "enum"; field: "status"; options: string[] };
    supplierId: { type: "enum"; field: "supplier_id"; options: string[] };
    category: { type: "enum"; field: "category"; options: string[] };
    month: { type: "month"; accessor: (b: SupplierBillListItem) => string };
    approval: { type: "enum"; field: "approval_status"; options: string[] };
    rep: { type: "enum"; options: string[] };
  }>({
    items: bills,
    facets: {
      search: {
        type: "text",
        fields: ["bill_number", "cfdi_uuid", "folio", "description"],
        accessors: [(b) => b.suppliers?.name ?? ""],
      },
      status: { type: "enum", field: "status", options: [] as unknown as string[] },
      supplierId: { type: "enum", field: "supplier_id", options: supplierOptions },
      category: { type: "enum", field: "category", options: [] as unknown as string[] },
      month: { type: "month", accessor: (b) => b.issue_date },
      approval: { type: "enum", field: "approval_status", options: [] as unknown as string[] },
      rep: { type: "enum", options: [...REP_OPTIONS] },
    },
  });

  // Aplicamos el filtro adicional de REP sobre el resultado del hook.
  const filtered = useMemo(
    () => filteredByFacets.filter((b) => matchesRep(b, values.rep)),
    [filteredByFacets, values.rep],
  );

  // API pública compatible con el hook anterior. `set(key, value)` acepta
  // los mismos nombres que antes; el resto son alias directos.
  const set = <K extends
    | "search"
    | "status"
    | "supplierId"
    | "category"
    | "month"
    | "approval"
    | "rep"
  >(k: K, v: string) => setRaw(k, v);

  const filterKey = `${baseKey}|rep=${values.rep}`;

  return {
    // Valores planos con los mismos nombres del hook anterior.
    search: values.search,
    status: values.status as SupplierBillStatus | "all",
    supplierId: values.supplierId as string | "all",
    category: values.category as ExpenseCategory | "all",
    month: values.month,
    approval: values.approval as SupplierBillApprovalStatus | "all",
    rep: values.rep as SupplierRepStatus | "all",
    // Helpers
    set,
    reset,
    hasActive: hasActiveBase,
    filtered,
    availableMonths,
    filterKey,
  };
}
