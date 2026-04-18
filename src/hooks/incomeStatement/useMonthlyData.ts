import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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
  expenses: Partial<Record<ExpenseCategory, number>>;
  rental_by_customer: Record<string, number>;
  sales_by_customer: Record<string, number>;
  depreciation_by_forklift: Record<string, number>;
}

interface RpcResult {
  months: RpcMonthRow[];
  rented_without_cost: { id: string; name: string }[];
}

export function useMonthlyData({ startDate, endDate, accountingBasis }: Props) {
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");

  const { data: rpc } = useQuery({
    queryKey: ["income_statement", startStr, endStr, accountingBasis],
    staleTime: 60_000,
    queryFn: async (): Promise<RpcResult> => {
      const { data, error } = await supabase.rpc("get_income_statement", {
        p_start_date: startStr,
        p_end_date: endStr,
        p_basis: accountingBasis,
      });
      if (error) throw error;
      return data as unknown as RpcResult;
    },
  });

  const data: MonthData[] = (rpc?.months ?? []).map((m): MonthData => {
    const expenses = { ...emptyExpenses(), ...m.expenses } as Record<ExpenseCategory, number>;
    const derived = computeDerivedTotals({
      revenue: Number(m.revenue),
      maintenanceCost: Number(m.maintenance_cost),
      damageCost: Number(m.damage_cost),
      depreciation: Number(m.depreciation),
      expenses,
    });
    // Capitalize month label (es-MX) for consistency with previous client output
    const label = m.month_label.charAt(0).toUpperCase() + m.month_label.slice(1);
    return {
      monthKey: m.month_key,
      month: label,
      revenue: Number(m.revenue),
      revenueRental: Number(m.revenue_rental),
      revenueSales: Number(m.revenue_sales),
      maintenanceCost: Number(m.maintenance_cost),
      damageCost: Number(m.damage_cost),
      depreciation: Number(m.depreciation),
      depreciationByForklift: m.depreciation_by_forklift ?? {},
      rentalByCustomer: m.rental_by_customer ?? {},
      salesByCustomer: m.sales_by_customer ?? {},
      expenses,
      ...derived,
    };
  });

  const rentedWithoutCost = rpc?.rented_without_cost ?? [];

  return { data, rentedWithoutCost };
}
