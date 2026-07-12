import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
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
  revenue_rental: number;
  revenue_sales: number;
  maintenance_cost: number;
  damage_cost: number;
  depreciation: number;
  cogs_forklift_sales: number;
  expenses: Partial<Record<ExpenseCategory, number>>;
  rental_by_customer: Record<string, number>;
  sales_by_customer: Record<string, number>;
  depreciation_by_forklift: Record<string, number>;
  cogs_by_forklift: Record<string, number>;
}

interface RpcResult {
  months: RpcMonthRow[];
  rented_without_cost: { id: string; name: string }[];
  sold_without_cost: { id: string; name: string }[];
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

export function useMonthlyData({ startDate, endDate, accountingBasis }: Props) {
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const { data: rpc } = useQuery(
    incomeStatementQueries.list({ startStr, endStr, accountingBasis }),
  );

  const data: MonthData[] = (rpc?.months ?? []).map((m): MonthData => {
    const rawExpenses = { ...emptyExpenses(), ...m.expenses } as Record<ExpenseCategory, number>;
    // Consolidación COGS: las facturas de proveedor con categoría `costo_venta`
    // representan el mismo concepto que el valor en libros de equipos vendidos.
    // Se suman a `cogsForkliftSales` y se retiran de `expenses` para evitar
    // doble conteo en la utilidad bruta y en el total de egresos.
    const cogsManual = Number(rawExpenses.costo_venta ?? 0);
    const expenses = { ...rawExpenses, costo_venta: 0 };
    const cogsAuto = Number(m.cogs_forklift_sales ?? 0);
    const cogsForkliftSales = cogsAuto + cogsManual;
    const cogsByForklift: Record<string, number> = { ...(m.cogs_by_forklift ?? {}) };
    if (cogsManual > 0) {
      cogsByForklift["Facturas de proveedor (manual)"] = cogsManual;
    }
    const derived = computeDerivedTotals({
      revenue: Number(m.revenue),
      maintenanceCost: Number(m.maintenance_cost),
      damageCost: Number(m.damage_cost),
      depreciation: Number(m.depreciation),
      cogsForkliftSales,
      expenses,
    });
    const label = formatMonthShortEs(m.month_key);
    return {
      monthKey: m.month_key,
      month: label,
      revenue: Number(m.revenue),
      revenueRental: Number(m.revenue_rental),
      revenueSales: Number(m.revenue_sales),
      maintenanceCost: Number(m.maintenance_cost),
      damageCost: Number(m.damage_cost),
      depreciation: Number(m.depreciation),
      cogsForkliftSales,
      cogsByForklift,
      depreciationByForklift: m.depreciation_by_forklift ?? {},
      rentalByCustomer: m.rental_by_customer ?? {},
      salesByCustomer: m.sales_by_customer ?? {},
      expenses,
      ...derived,
    };
  });


  const rentedWithoutCost = rpc?.rented_without_cost ?? [];
  const soldWithoutCost = rpc?.sold_without_cost ?? [];

  return { data, rentedWithoutCost, soldWithoutCost };
}
