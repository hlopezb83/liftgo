
import { useMemo } from "react";
import { toYMD } from "@/lib/date/toYMD";
import { toMxn } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import { useSupplierBills, type SupplierBillListItem } from "./useSupplierBills";

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

// R7 Bloque 6: normalizar montos crudos de supplier_bills a MXN. El campo
// balance/total viene en moneda original; sin conversión los KPIs y aging
// mezclaban pesos con dólares causando totales incoherentes con Flujo de Caja.
function balanceMxn(b: SupplierBillListItem): number {
  return toMxn(Number(b.balance), b.currency, b.exchange_rate);
}
function totalMxn(b: SupplierBillListItem): number {
  return toMxn(Number(b.total), b.currency, b.exchange_rate);
}

function accumulateBill(acc: AccountsPayableKpis, b: SupplierBillListItem, ctx: KpiCtx) {
  if (b.status === "cancelled") return;
  const balMxn = balanceMxn(b);
  if (balMxn > 0) {
    acc.totalPendiente += balMxn;
    if (b.due_date && b.due_date < ctx.todayYmd) acc.totalVencido += balMxn;
    else if (b.due_date && b.due_date <= ctx.in7Ymd) acc.totalPorVencer += balMxn;
  }
  if (b.status === "paid" && b.issue_date.startsWith(ctx.monthPrefix)) {
    acc.pagadoMesActual += totalMxn(b);
  }
  if (b.approval_status === "pending") {
    acc.countPorAprobar += 1;
    acc.totalPorAprobar += totalMxn(b);
  }
  acc.repPendientes += b.rep_summary.pending;
}

export function useAccountsPayableKpis() {
  const { data, isLoading, isError, refetch } = useSupplierBills();

  const kpis: AccountsPayableKpis = useMemo(() => {
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
  }, [data]);

  return { kpis, isLoading, isError, refetch, bills: data ?? [] };
}
