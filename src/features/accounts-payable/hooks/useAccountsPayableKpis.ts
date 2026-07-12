
import { useSupplierBills, type SupplierBillListItem } from "./useSupplierBills";
import { nowMty } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";

export interface AccountsPayableKpis {
  totalPendiente: number;
  totalVencido: number;
  totalPorVencer: number;
  pagadoMesActual: number;
  totalPorAprobar: number;
  countPorAprobar: number;
  repPendientes: number;
}

interface KpiCtx { todayYmd: string; in7Ymd: string; monthPrefix: string }

function accumulateBill(acc: AccountsPayableKpis, b: SupplierBillListItem, ctx: KpiCtx) {
  if (b.status === "cancelled") return;
  if (b.balance > 0) {
    acc.totalPendiente += Number(b.balance);
    if (b.due_date && b.due_date < ctx.todayYmd) acc.totalVencido += Number(b.balance);
    else if (b.due_date && b.due_date <= ctx.in7Ymd) acc.totalPorVencer += Number(b.balance);
  }
  if (b.status === "paid" && b.issue_date.startsWith(ctx.monthPrefix)) {
    acc.pagadoMesActual += Number(b.total);
  }
  if (b.approval_status === "pending") {
    acc.countPorAprobar += 1;
    const mxn = b.currency === "MXN"
      ? Number(b.total)
      : Number(b.total) * Number(b.exchange_rate ?? 1);
    acc.totalPorAprobar += mxn;
  }
  acc.repPendientes += b.rep_summary.pending;
}

export function useAccountsPayableKpis() {
  const { data, isLoading } = useSupplierBills();

  const kpis: AccountsPayableKpis = (() => {
    const today = nowMty();
    const todayYmd = toYMD(today) ?? "";
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    const ctx: KpiCtx = { todayYmd, in7Ymd: toYMD(in7) ?? "", monthPrefix: todayYmd.slice(0, 7) };

    const acc: AccountsPayableKpis = {
      totalPendiente: 0, totalVencido: 0, totalPorVencer: 0, pagadoMesActual: 0,
      totalPorAprobar: 0, countPorAprobar: 0, repPendientes: 0,
    };
    for (const b of data ?? []) accumulateBill(acc, b, ctx);
    return acc;
  })();

  return { kpis, isLoading, bills: (data ?? []) as SupplierBillListItem[] };
}
