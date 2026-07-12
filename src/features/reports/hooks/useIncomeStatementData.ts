import { useMonthlyData } from "./incomeStatement/useMonthlyData";
import { useStatementRows, useComparisonRows } from "./incomeStatement/useStatementRows";
import { useStatementTotals } from "./incomeStatement/useStatementTotals";
import type { AccountingBasis } from "./incomeStatement/types";

export type {
  MonthData, StatementRow, YearTotals, ComparisonRow, ExpenseCategory,
} from "./incomeStatement/types";
export {
  EXPENSE_CATEGORIES, DIRECT_COST_CATEGORIES, EXPENSE_CATEGORY_LABELS,
} from "./incomeStatement/types";

interface UseIncomeStatementDataProps {
  startDate: Date;
  endDate: Date;
  accountingBasis?: AccountingBasis;
}

export function useIncomeStatementData({
  startDate, endDate, accountingBasis = "accrual",
}: UseIncomeStatementDataProps) {
  const { data, rentedWithoutCost, soldWithoutCost } = useMonthlyData({ startDate, endDate, accountingBasis });
  const {
    filteredData, totals, yearTotals,
    availableYears, selectedYear, setSelectedYear, isComparison,
  } = useStatementTotals(data);
  const {
    statementRows, csvRows,
    depreciationBreakdownRows, cogsBreakdownRows, rentalBreakdownRows, salesBreakdownRows,
  } = useStatementRows(filteredData, totals);
  const comparisonRows = useComparisonRows(yearTotals);

  return {
    data, filteredData, totals, statementRows, comparisonRows, yearTotals,
    csvRows, depreciationBreakdownRows, cogsBreakdownRows, rentalBreakdownRows, salesBreakdownRows,
    rentedWithoutCost,
    soldWithoutCost,
    availableYears, selectedYear, setSelectedYear, isComparison,
  };
}

