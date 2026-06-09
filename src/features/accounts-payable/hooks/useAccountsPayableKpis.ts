import { useMemo } from "react";
import { useSupplierBills, type SupplierBillListItem } from "./useSupplierBills";
import { nowMty } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";

export interface AccountsPayableKpis {
  totalPendiente: number;
  totalVencido: number;
  totalPorVencer: number;
  pagadoMesActual: number;
}

export function useAccountsPayableKpis() {
  const { data, isLoading } = useSupplierBills();

  const kpis = useMemo<AccountsPayableKpis>(() => {
    const today = nowMty();
    const todayYmd = toYMD(today) ?? "";
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const in7Ymd = toYMD(in7) ?? "";
    const monthPrefix = todayYmd.slice(0, 7);

    let totalPendiente = 0;
    let totalVencido = 0;
    let totalPorVencer = 0;
    let pagadoMesActual = 0;

    for (const b of data ?? []) {
      if (b.status === "cancelled") continue;
      if (b.balance > 0) {
        totalPendiente += Number(b.balance);
        if (b.due_date && b.due_date < todayYmd) {
          totalVencido += Number(b.balance);
        } else if (b.due_date && b.due_date <= in7Ymd) {
          totalPorVencer += Number(b.balance);
        }
      }
      if (b.status === "paid" && b.issue_date.startsWith(monthPrefix)) {
        pagadoMesActual += Number(b.total);
      }
    }

    return { totalPendiente, totalVencido, totalPorVencer, pagadoMesActual };
  }, [data]);

  return { kpis, isLoading, bills: (data ?? []) as SupplierBillListItem[] };
}
