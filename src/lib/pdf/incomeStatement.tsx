import type {
  StatementRow, ComparisonRow, YearTotals, MonthData,
} from "@/features/reports/hooks/useIncomeStatementData";
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
  const [{ pdf }, { saveAs }, { IncomeStatementDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("file-saver"),
    import("@/lib/pdf/documents/IncomeStatementDocument"),
  ]);
  const blob = await pdf(
    <IncomeStatementDocument company={company} logoBase64={logoBase64} {...params} />
  ).toBlob();
  saveAs(blob, `estado-resultados${params.selectedYear !== "all" ? `-${params.selectedYear}` : ""}.pdf`);
}
