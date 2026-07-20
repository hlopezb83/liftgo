import { Document, Page, Text, View } from "@react-pdf/renderer";
import type {
  StatementRow, ComparisonRow, YearTotals, MonthData,
} from "@/features/reports/hooks/useIncomeStatementData";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Footer } from "@/lib/pdf/components/Footer";
import type { CompanyData } from "@/lib/pdf/shared";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import { nowMty } from "@/lib/utils";

export interface IncomeStatementDocumentProps {
  company: CompanyData | null;
  logoBase64: string | null;
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

function periodLabel(p: IncomeStatementDocumentProps): string {
  if (p.selectedYear === "all") return `${formatDateMty(p.startDate)} — ${formatDateMty(p.endDate)}`;
  if (p.selectedYear === "compare") return `Comparativo: ${p.availableYears.join(" vs ")}`;
  return `Año ${p.selectedYear}`;
}

function fmtVal(val: number, isPct?: boolean): string {
  return isPct ? `${val.toFixed(1)}%` : formatCurrency(val);
}

function fmtDelta(d: number, isPct?: boolean): string {
  const sign = d >= 0 ? "+" : "";
  return isPct ? `${sign}${d.toFixed(1)} pp` : `${sign}${formatCurrency(d)}`;
}

function isCost(_label: string, isCost: boolean | undefined, value: number): boolean {
  return Boolean(isCost) || value < 0;
}

interface RowProps {
  row: StatementRow | ComparisonRow;
  i: number;
  isComparison: boolean;
  cellWidth: number;
}

function StatementRowView({ row, i, isComparison, cellWidth }: RowProps) {
  const isSub = row.isSubtotal;
  const bg = isSub ? COLORS.gray100 : i % 2 === 0 ? COLORS.gray50 : COLORS.white;
  const labelColor = isSub ? COLORS.gray900 : COLORS.gray700;
  const labelFont = isSub ? "Helvetica-Bold" : "Helvetica";
  return (
    <View
      style={{
        flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6,
        backgroundColor: bg, borderBottomWidth: 0.2, borderBottomColor: COLORS.gray200,
      }}
      wrap={false}
    >
      <Text style={{ width: 160, fontSize: FONT_SIZES.xs, color: labelColor, fontFamily: labelFont }}>
        {row.label}
      </Text>
      {isComparison
        ? <ComparisonValues row={row as ComparisonRow} cellWidth={cellWidth} />
        : <StatementValues row={row as StatementRow} cellWidth={cellWidth} />}
    </View>
  );
}

function StatementValues({ row, cellWidth }: { row: StatementRow; cellWidth: number }) {
  return (
    <>
      {row.values.map((v, i) => {
        const cost = isCost(row.label, row.isCost, v);
        return (
          <Text key={i} style={{
            width: cellWidth, textAlign: "right", fontSize: FONT_SIZES.xs,
            color: cost ? COLORS.costRed : (row.isSubtotal ? COLORS.gray900 : COLORS.gray700),
            fontFamily: row.isSubtotal ? "Helvetica-Bold" : "Helvetica",
          }}>{fmtVal(v, row.isPercent)}</Text>
        );
      })}
      <Text style={{
        width: cellWidth, textAlign: "right", fontSize: FONT_SIZES.xs, fontFamily: "Helvetica-Bold",
        color: isCost(row.label, row.isCost, row.total) ? COLORS.costRed : COLORS.gray900,
      }}>{fmtVal(row.total, row.isPercent)}</Text>
    </>
  );
}

function ComparisonValues({ row, cellWidth }: { row: ComparisonRow; cellWidth: number }) {
  return (
    <>
      {row.yearValues.map((v, i) => {
        const cost = isCost(row.label, row.isCost, v);
        return (
          <Text key={i} style={{
            width: cellWidth, textAlign: "right", fontSize: FONT_SIZES.xs,
            color: cost ? COLORS.costRed : (row.isSubtotal ? COLORS.gray900 : COLORS.gray700),
            fontFamily: row.isSubtotal ? "Helvetica-Bold" : "Helvetica",
          }}>{fmtVal(v, row.isPercent)}</Text>
        );
      })}
      <Text style={{
        width: cellWidth, textAlign: "right", fontSize: FONT_SIZES.xs, fontFamily: "Helvetica-Bold",
        color: row.delta >= 0 ? COLORS.positiveGreen : COLORS.costRed,
      }}>{fmtDelta(row.delta, row.isPercent)}</Text>
      <Text style={{
        width: cellWidth, textAlign: "right", fontSize: FONT_SIZES.xs, fontFamily: "Helvetica-Bold",
        color: row.deltaPct === null ? COLORS.gray500 : row.deltaPct >= 0 ? COLORS.positiveGreen : COLORS.costRed,
      }}>
        {row.deltaPct === null ? "—" : `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%`}
      </Text>
    </>
  );
}

export function IncomeStatementDocument(props: IncomeStatementDocumentProps) {
  const rows = props.isComparison ? props.comparisonRows : props.statementRows;
  const headers = props.isComparison
    ? [...props.yearTotals.map((y) => y.year), "Var. $", "Var. %"]
    : [...props.filteredData.map((d) => d.month), "Total"];
  // Landscape A4 = 842pt wide. After margins ~ 760pt. Label = 160. Cells share rest.
  const cellWidth = Math.max(40, Math.min(70, Math.floor((760 - 160) / headers.length)));

  return (
    <Document title={`Estado de Resultados ${props.selectedYear}`}>
      <Page size="A4" orientation="landscape" style={sharedStyles.pageLandscape}>
        <AccentBar />
        <View style={sharedStyles.headerRow}>
          <View>
            {props.logoBase64 && <Text>{/* logo intentionally skipped on landscape to save space */}</Text>}
            {props.company && (
              <>
                <Text style={[sharedStyles.infoName, { fontSize: FONT_SIZES.md }]}>{props.company.razon_social}</Text>
                <Text style={[sharedStyles.infoLine, { fontSize: FONT_SIZES.xs }]}>
                  RFC: {props.company.rfc}  ·  Régimen: {props.company.regimen_fiscal}  ·  C.P. {props.company.lugar_expedicion}
                </Text>
              </>
            )}
          </View>
          <View style={sharedStyles.headerRight}>
            <Text style={sharedStyles.headerKicker}>ESTADO DE RESULTADOS</Text>
            <Text style={sharedStyles.headerNumber}>{periodLabel(props)}</Text>
            <Text style={sharedStyles.headerMeta}>Emitido: {formatDateMty(nowMty())}</Text>
          </View>
        </View>
        <View style={sharedStyles.separator} />

        <View style={sharedStyles.tableHeader} fixed>
          <Text style={[sharedStyles.tableHeaderText, { width: 160 }]}>CONCEPTO</Text>
          {headers.map((h, i) => (
            <Text key={i} style={[sharedStyles.tableHeaderText, { width: cellWidth, textAlign: "right" }]}>
              {h.toUpperCase()}
            </Text>
          ))}
        </View>

        {rows.map((row, i) => (
          <StatementRowView key={i} row={row} i={i} isComparison={props.isComparison} cellWidth={cellWidth} />
        ))}

        <Footer companyName={props.company?.razon_social ?? null} prefix="Estado de Resultados" />
      </Page>
    </Document>
  );
}
