import { useQuery } from "@tanstack/react-query";
import { toYMD } from "@/lib/format/dateFormats";
import { formatMonthShortEs } from "@/lib/format/formatMonthEs";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import { incomeStatementKeys } from "../../lib/queryKeys";
import {
  type MonthData, type AccountingBasis, type ExpenseCategory,
  emptyExpenses, computeDerivedTotals,
} from "./types";

interface Props {
  startDate: Date;
  endDate: Date;
  accountingBasis: AccountingBasis;
}

interface RpcMonthRow {
  month_key: string;
  month_label: string;
  revenue: number;
  revenue_rental_booked: number;
  revenue_rental_unbooked: number;
  revenue_sales: number;
  revenue_other_services: number;
  revenue_damage_recovery: number;
  credit_notes_total: number;
  maintenance_cost: number;
  damage_cost: number;
  depreciation: number;
  depreciation_rented: number;
  depreciation_idle: number;
  cogs_forklift_sales: number;
  expenses: Partial<Record<ExpenseCategory, number>>;
  expenses_detail_by_category: Partial<Record<ExpenseCategory, Array<{ supplier: string; description: string; amount: number; date: string }>>>;
  rental_booked_by_customer: Record<string, number>;
  rental_unbooked_by_customer: Record<string, number>;
  sales_by_customer: Record<string, number>;
  other_services_by_customer: Record<string, number>;
  damage_recovery_by_customer: Record<string, number>;
  credit_notes_by_customer: Record<string, number>;
  depreciation_by_forklift: Record<string, number>;
  cogs_by_forklift: Record<string, number>;
}

interface RpcResult {
  months: RpcMonthRow[];
  rented_without_cost: { id: string; name: string }[];
  sold_without_cost: { id: string; name: string }[];
  /** 2A-1: documentos en divisa sin tipo de cambio, excluidos del reporte. */
  fx_missing?: { invoices?: number; supplier_bills?: number };
}


export const incomeStatementQueries = defineEntityQueries<
  typeof incomeStatementKeys.all[number],
  RpcResult,
  never
>("income_statement", {
  list: (filter) => () => {
    const startStr = filter?.startStr as string;
    const endStr = filter?.endStr as string;
    const accountingBasis = filter?.accountingBasis as AccountingBasis;
    return callRpc<RpcResult>("get_income_statement", {
      p_start_date: startStr,
      p_end_date: endStr,
      p_basis: accountingBasis,
    });
  },
  staleTime: 60_000,
});

/** Consolida el COGS manual (facturas de proveedor `costo_venta`) con el automático. */
function resolveCogs(m: RpcMonthRow) {
  const rawExpenses = { ...emptyExpenses(), ...m.expenses } as Record<ExpenseCategory, number>;
  // Las facturas de proveedor con categoría `costo_venta` representan el mismo
  // concepto que el valor en libros de equipos vendidos: se suman al COGS y se
  // retiran de `expenses` para evitar doble conteo.
  const cogsManual = Number(rawExpenses.costo_venta ?? 0);
  const expenses = { ...rawExpenses, costo_venta: 0 };
  const cogsForkliftSales = Number(m.cogs_forklift_sales ?? 0) + cogsManual;
  const cogsByForklift: Record<string, number> = { ...(m.cogs_by_forklift ?? {}) };
  if (cogsManual > 0) cogsByForklift["Facturas de proveedor (manual)"] = cogsManual;
  return { expenses, cogsForkliftSales, cogsByForklift };
}

/** Desgloses por cliente/equipo (todos opcionales en el RPC). */
function mapBreakdowns(m: RpcMonthRow) {
  return {
    depreciationByForklift: m.depreciation_by_forklift ?? {},
    rentalBookedByCustomer: m.rental_booked_by_customer ?? {},
    rentalUnbookedByCustomer: m.rental_unbooked_by_customer ?? {},
    salesByCustomer: m.sales_by_customer ?? {},
    otherServicesByCustomer: m.other_services_by_customer ?? {},
    damageRecoveryByCustomer: m.damage_recovery_by_customer ?? {},
    creditNotesByCustomer: m.credit_notes_by_customer ?? {},
    expensesDetailByCategory: m.expenses_detail_by_category ?? {},
  };
}

/** Montos escalares del mes (ingresos, costos y depreciación). */
function mapAmounts(m: RpcMonthRow) {
  return {
    revenue: Number(m.revenue),
    revenueRentalBooked: Number(m.revenue_rental_booked),
    revenueRentalUnbooked: Number(m.revenue_rental_unbooked),
    revenueSales: Number(m.revenue_sales),
    revenueOtherServices: Number(m.revenue_other_services ?? 0),
    revenueDamageRecovery: Number(m.revenue_damage_recovery ?? 0),
    creditNotes: Number(m.credit_notes_total ?? 0),
    maintenanceCost: Number(m.maintenance_cost),
    damageCost: Number(m.damage_cost),
    depreciation: Number(m.depreciation),
    depreciationRented: Number(m.depreciation_rented ?? 0),
    depreciationIdle: Number(m.depreciation_idle ?? 0),
  };
}

function mapMonthRow(m: RpcMonthRow): MonthData {
  const { expenses, cogsForkliftSales, cogsByForklift } = resolveCogs(m);
  const amounts = mapAmounts(m);
  const derived = computeDerivedTotals({
    revenue: amounts.revenue,
    maintenanceCost: amounts.maintenanceCost,
    damageCost: amounts.damageCost,
    depreciation: amounts.depreciation,
    cogsForkliftSales,
    expenses,
  });
  return {
    monthKey: m.month_key,
    month: formatMonthShortEs(m.month_key),
    ...amounts,
    cogsForkliftSales,
    cogsByForklift,
    ...mapBreakdowns(m),
    expenses,
    ...derived,
  };
}

export function useMonthlyData({ startDate, endDate, accountingBasis }: Props) {
  const startStr = toYMD(startDate);
  const endStr = toYMD(endDate);

  const { data: rpc, isError, isFetching, refetch } = useQuery(
    incomeStatementQueries.list({ startStr, endStr, accountingBasis }),
  );

  const data: MonthData[] = (rpc?.months ?? []).map(mapMonthRow);
  const rentedWithoutCost = rpc?.rented_without_cost ?? [];
  const soldWithoutCost = rpc?.sold_without_cost ?? [];
  const fxMissingCount =
    Number(rpc?.fx_missing?.invoices ?? 0) + Number(rpc?.fx_missing?.supplier_bills ?? 0);

  return { data, rentedWithoutCost, soldWithoutCost, fxMissingCount, isError, isFetching, refetch };

}

