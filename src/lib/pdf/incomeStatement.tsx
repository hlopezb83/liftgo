import type {
  StatementRow, ComparisonRow, YearTotals, MonthData,
} from "@/features/reports/hooks/useIncomeStatementData";
import { IncomeStatementDocument } from "@/lib/pdf/documents/IncomeStatementDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import { fetchCompanyDataAndLogo } from "@/lib/pdf/shared";

interface ExportPdfParams {
  filteredData: MonthData[];
  statementRows: StatementRow[];
  comparisonRows: ComparisonRow[];
  yearTotals: YearTotals[];
  isComparison: boolean;
  selectedYear: string;
  availableYears: string[];
  startDate: Date;
  endDate: Date;
}

export async function exportIncomeStatementPdf(params: ExportPdfParams): Promise<void> {
  const { company, logoBase64 } = await fetchCompanyDataAndLogo();
  await renderAndSave(
    <IncomeStatementDocument company={company} logoBase64={logoBase64} {...params} />,
    `estado-resultados${params.selectedYear !== "all" ? `-${params.selectedYear}` : ""}.pdf`,
  );
}
