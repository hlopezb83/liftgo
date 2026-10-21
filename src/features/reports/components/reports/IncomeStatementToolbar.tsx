import { DownloadIcon, FileDown } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToCsv } from "@/lib/exportCsv";

type CsvRow = Record<string, unknown>;

interface Props {
  availableYears: string[];
  selectedYear: string;
  setSelectedYear: (v: string) => void;
  csvRows: CsvRow[];
  csvFilename?: string;
  onExportPdf: () => void;
  pdfLoading: boolean;
}

export function IncomeStatementToolbar({
  availableYears, selectedYear, setSelectedYear, csvRows,
  csvFilename = "estado-resultados.csv", onExportPdf, pdfLoading,
}: Props) {
  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      {availableYears.length > 1 && (
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[140px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {availableYears.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
            <SelectItem value="compare">Comparativo</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Button variant="outline" size="sm" disabled={csvRows.length === 0} onClick={() => exportToCsv(csvFilename, csvRows)}>
        <DownloadIcon className="h-4 w-4 mr-1" />CSV
      </Button>
      <Button variant="outline" size="sm" onClick={onExportPdf} disabled={pdfLoading}>
        <FileDown className="h-4 w-4 mr-1" />{pdfLoading ? "Generando…" : "PDF"}
      </Button>
    </div>
  );
}
