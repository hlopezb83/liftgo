import { useMemo } from "react";
import { useSupplierBills } from "./useSupplierBills";
import { nowMty } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";

export interface AgingRow {
  supplierId: string;
  supplierName: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

export interface AgingTotals {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

function diffDays(a: string, b: string): number {
  return Math.floor((new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) / 86_400_000);
}

function bucketKey(overdueDays: number): keyof Omit<AgingRow, "supplierId" | "supplierName" | "total"> {
  if (overdueDays <= 0) return "current";
  if (overdueDays <= 30) return "d1_30";
  if (overdueDays <= 60) return "d31_60";
  if (overdueDays <= 90) return "d61_90";
  return "d90_plus";
}

const EMPTY_TOTALS: AgingTotals = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };

export function useAgingReport() {
  const { data, isLoading } = useSupplierBills();

  const { rows, totals } = useMemo(() => {
    const todayYmd = toYMD(nowMty()) ?? "";
    const byId = new Map<string, AgingRow>();

    for (const b of data ?? []) {
      const balance = Number(b.balance);
      if (b.status === "cancelled" || balance <= 0) continue;
      const supplierId = b.supplier_id ?? "sin-proveedor";
      const supplierName = b.suppliers?.name ?? "Sin proveedor";
      const row = byId.get(supplierId) ?? {
        supplierId, supplierName,
        current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0,
      };

      const due = b.due_date ?? b.issue_date;
      const key = bucketKey(diffDays(todayYmd, due));
      row[key] += balance;
      row.total += balance;
      byId.set(supplierId, row);
    }

    const rows = Array.from(byId.values()).sort((a, b) => b.total - a.total);
    const totals: AgingTotals = rows.reduce<AgingTotals>(
      (acc, r) => ({
        current: acc.current + r.current,
        d1_30: acc.d1_30 + r.d1_30,
        d31_60: acc.d31_60 + r.d31_60,
        d61_90: acc.d61_90 + r.d61_90,
        d90_plus: acc.d90_plus + r.d90_plus,
        total: acc.total + r.total,
      }),
      EMPTY_TOTALS,
    );

    return { rows, totals };
  }, [data]);

  return { rows, totals, isLoading };
}
