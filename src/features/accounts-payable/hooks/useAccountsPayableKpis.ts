
import { useMemo } from "react";
import { isFxMissing } from "@/features/cash-flow";
import { toYMD } from "@/lib/date/toYMD";
import { toMxn } from "@/lib/money";
import { visibleListRows } from "@/lib/supabase/constants";
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
  /** G-B4: facturas en divisa sin tipo de cambio, excluidas de los totales. */
  fxMissingCount: number;
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

/**
 * R8-11: una factura sin TC sólo se avisa si pertenece al universo exigible
 * (no borrador y con saldo), el mismo que usa `useAgingReport`. Antes el KPI
 * contaba antes de filtrar borradores y no cuadraba con la antigüedad.
 */
function isAgingEligible(b: SupplierBillListItem): boolean {
  return b.status !== "draft" && Number(b.balance) > 0;
}

/**
 * G-B4 / R9-11: factura en divisa sin tipo de cambio. No se puede convertir a
 * MXN, así que no entra en ningún importe; pero sí sigue esperando aprobación
 * y sus REP siguen pendientes.
 */
function accumulateFxMissing(
  acc: AccountsPayableKpis,
  b: SupplierBillListItem,
  isPendingApproval: boolean,
) {
  if (isAgingEligible(b)) acc.fxMissingCount += 1;
  acc.repPendientes += b.rep_summary.pending;
  if (isPendingApproval) acc.countPorAprobar += 1;
}

/**
 * BL-R8-02: un borrador con balance no es cartera vencida ni pendiente real
 * (CP-0009 draft inflaba "Vencido $142K"). Se excluye de los tres KPIs de saldo.
 */
function accumulateBalance(acc: AccountsPayableKpis, b: SupplierBillListItem, ctx: KpiCtx) {
  const balMxn = balanceMxn(b);
  if (balMxn <= 0 || b.status === "draft") return;
  acc.totalPendiente += balMxn;
  if (b.due_date && b.due_date < ctx.todayYmd) acc.totalVencido += balMxn;
  else if (b.due_date && b.due_date <= ctx.in7Ymd) acc.totalPorVencer += balMxn;
}

function accumulateBill(acc: AccountsPayableKpis, b: SupplierBillListItem, ctx: KpiCtx) {
  if (b.status === "cancelled") return;
  // QA 2A-3: una factura rechazada en aprobación no es deuda vigente.
  if (b.approval_status === "rejected") return;

  // BL-R8-03: una factura pagada puede quedar con approval_status huérfano en
  // 'pending' (CP-0010) — no cuenta como "por aprobar". Los borradores SÍ
  // cuentan aquí: son justo lo que está esperando aprobación.
  const isPendingApproval = b.approval_status === "pending" && b.status !== "paid";

  if (isFxMissing(b.currency, b.exchange_rate)) {
    accumulateFxMissing(acc, b, isPendingApproval);
    return;
  }

  accumulateBalance(acc, b, ctx);
  // B-10: "pagado mes actual" se calcula por la FECHA REAL DE PAGO
  // (supplier_payments.payment_date), no por issue_date — una factura emitida
  // en mayo y pagada en junio cuenta en junio. Se suman los amounts de los
  // pagos del mes (soporta pagos parciales) convertidos a MXN con la
  // moneda/tipo de cambio de la factura.
  for (const p of b.payments) {
    if (p.payment_date.startsWith(ctx.monthPrefix)) {
      acc.pagadoMesActual += toMxn(Number(p.amount), b.currency, b.exchange_rate);
    }
  }
  if (isPendingApproval) {
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
      totalPorAprobar: 0, countPorAprobar: 0, repPendientes: 0, fxMissingCount: 0,
    };
    // N8-r3: los KPIs no deben incluir la fila extra del limit+1.
    for (const b of visibleListRows(data)) accumulateBill(acc, b, ctx);
    return acc;
  }, [data]);

  return { kpis, isLoading, isError, refetch, bills: data ?? [] };
}
