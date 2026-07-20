import { useState } from "react";
import { roundMoney } from "@/lib/money";
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
        revenueRentalBooked: acc.revenueRentalBooked + r.revenueRentalBooked,
        revenueRentalUnbooked: acc.revenueRentalUnbooked + r.revenueRentalUnbooked,
        revenueSales: acc.revenueSales + r.revenueSales,
        maintenanceCost: acc.maintenanceCost + r.maintenanceCost,
        damageCost: acc.damageCost + r.damageCost,
        depreciation: acc.depreciation + r.depreciation,
        depreciationRented: acc.depreciationRented + r.depreciationRented,
        depreciationIdle: acc.depreciationIdle + r.depreciationIdle,
        cogsForkliftSales: acc.cogsForkliftSales + r.cogsForkliftSales,
        expenses,
      };
    },
    {
      revenue: 0, revenueRentalBooked: 0, revenueRentalUnbooked: 0, revenueSales: 0,
      maintenanceCost: 0, damageCost: 0, depreciation: 0,
      depreciationRented: 0, depreciationIdle: 0,
      cogsForkliftSales: 0,
      expenses: {
        renta: 0, nomina: 0, software: 0, depreciacion: 0,
        caja_chica: 0, publicidad: 0, otro: 0, costo_venta: 0,
      } as Record<ExpenseCategory, number>,
    }
  );
  const expensesRounded = { ...t.expenses };
  allCats.forEach((c) => { expensesRounded[c] = roundMoney(expensesRounded[c]); });
  const rounded = {
    revenue: roundMoney(t.revenue),
    revenueRentalBooked: roundMoney(t.revenueRentalBooked),
    revenueRentalUnbooked: roundMoney(t.revenueRentalUnbooked),
    revenueSales: roundMoney(t.revenueSales),
    maintenanceCost: roundMoney(t.maintenanceCost),
    damageCost: roundMoney(t.damageCost),
    depreciation: roundMoney(t.depreciation),
    depreciationRented: roundMoney(t.depreciationRented),
    depreciationIdle: roundMoney(t.depreciationIdle),
    cogsForkliftSales: roundMoney(t.cogsForkliftSales),
    expenses: expensesRounded,
  };
  return { ...rounded, ...computeDerivedTotals(rounded) };
}


export function useStatementTotals(data: MonthData[]) {
  const availableYears = [...new Set(data.map((d) => d.monthKey.substring(0, 4)))].sort();

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const isComparison = selectedYear === "compare";

  const filteredData = (selectedYear === "all" || selectedYear === "compare")
    ? data
    : data.filter((d) => d.monthKey.startsWith(selectedYear));

  const totals = aggregate(filteredData);

  const yearTotals: YearTotals[] = isComparison
    ? availableYears.map((year) => {
        const yearData = data.filter((d) => d.monthKey.startsWith(year));
        return { year, ...aggregate(yearData) };
      })
    : [];

  return {
    filteredData, totals, yearTotals,
    availableYears, selectedYear, setSelectedYear, isComparison,
  };
}
