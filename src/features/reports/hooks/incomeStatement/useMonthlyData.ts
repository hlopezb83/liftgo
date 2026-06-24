import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";
import { format } from "date-fns";
import { formatMonthShortEs } from "@/lib/format/formatMonthEs";
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

export function useMonthlyData({ startDate, endDate, accountingBasis }: Props) {
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const { data: rpc } = useQuery({
    queryKey: ["income_statement", startStr, endStr, accountingBasis],
    staleTime: 60_000,
    queryFn: () =>
      callRpc<RpcResult>("get_income_statement", {
        p_start_date: startStr,
        p_end_date: endStr,
        p_basis: accountingBasis,
      }),
  });

  const data: MonthData[] = (rpc?.months ?? []).map((m): MonthData => {
    const expenses = { ...emptyExpenses(), ...m.expenses } as Record<ExpenseCategory, number>;
    const cogsForkliftSales = Number(m.cogs_forklift_sales ?? 0);
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
      cogsByForklift: m.cogs_by_forklift ?? {},
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
