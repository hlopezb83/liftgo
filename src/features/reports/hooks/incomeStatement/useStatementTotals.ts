import { useMemo, useState } from "react";
import {
  type MonthData, type YearTotals, type ExpenseCategory,
  EXPENSE_CATEGORIES, DIRECT_COST_CATEGORIES, computeDerivedTotals,
} from "./types";

function aggregate(rows: MonthData[]) {
  const allCats = [...EXPENSE_CATEGORIES, ...DIRECT_COST_CATEGORIES];
  const t = rows.reduce(
    (acc, r) => {
      const expenses = { ...acc.expenses };
      allCats.forEach((c) => { expenses[c] = (expenses[c] || 0) + r.expenses[c]; });
      return {
        revenue: acc.revenue + r.revenue,
        revenueRental: acc.revenueRental + r.revenueRental,
        revenueSales: acc.revenueSales + r.revenueSales,
        maintenanceCost: acc.maintenanceCost + r.maintenanceCost,
        damageCost: acc.damageCost + r.damageCost,
        depreciation: acc.depreciation + r.depreciation,
        expenses,
      };
    },
    {
      revenue: 0, revenueRental: 0, revenueSales: 0,
      maintenanceCost: 0, damageCost: 0, depreciation: 0,
      expenses: {
        renta: 0, nomina: 0, software: 0, depreciacion: 0,
        caja_chica: 0, publicidad: 0, otro: 0, costo_venta: 0,
      } as Record<ExpenseCategory, number>,
    }
  );
  return { ...t, ...computeDerivedTotals(t) };
}

export function useStatementTotals(data: MonthData[]) {
  const availableYears = useMemo(() => {
    return [...new Set(data.map((d) => d.monthKey.substring(0, 4)))].sort();
  }, [data]);

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const isComparison = selectedYear === "compare";

  const filteredData = useMemo(() => {
    if (selectedYear === "all" || selectedYear === "compare") return data;
    return data.filter((d) => d.monthKey.startsWith(selectedYear));
  }, [data, selectedYear]);

  const totals = useMemo(() => aggregate(filteredData), [filteredData]);

  const yearTotals = useMemo((): YearTotals[] => {
    if (!isComparison) return [];
    return availableYears.map((year) => {
      const yearData = data.filter((d) => d.monthKey.startsWith(year));
      return { year, ...aggregate(yearData) };
    });
  }, [isComparison, availableYears, data]);

  return {
    filteredData, totals, yearTotals,
    availableYears, selectedYear, setSelectedYear, isComparison,
  };
}
