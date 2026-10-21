import { Document, Page, Text, View } from "@react-pdf/renderer";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { AccentBar } from "@/lib/pdf/components/AccentBar";
import { Footer } from "@/lib/pdf/components/Footer";
import type { CompanyData } from "@/lib/pdf/shared";
import { sharedStyles } from "@/lib/pdf/theme/styles";
import { COLORS, FONT_SIZES } from "@/lib/pdf/theme/tokens";
import type {
  PdfStatementRow as StatementRow,
  PdfComparisonRow as ComparisonRow,
  PdfYearTotals as YearTotals,
  PdfMonthData as MonthData,
} from "@/lib/pdf/types/incomeStatement";
import { isFavorableStatementDelta, statementContextLines, statementMonthChunks, type IncomeStatementExportContext } from "@/lib/reports/incomeStatementPresentation";
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
  exportContext?: IncomeStatementExportContext;
}

function periodLabel(p: IncomeStatementDocumentProps): string {
  if (p.exportContext) return `${p.exportContext.periodStart} — ${p.exportContext.periodEnd}`;
  return `${formatDateMty(p.startDate)} — ${formatDateMty(p.endDate)}`;
}

function fmtVal(val: number | null, isPct?: boolean): string {
  if (val === null) return "No aplica";
  return isPct ? `${val.toFixed(1)}%` : formatCurrency(val);
}

function fmtDelta(d: number | null, isPct?: boolean): string {
  if (d === null) return "No aplica";
  const sign = d >= 0 ? "+" : "";
  return isPct ? `${sign}${d.toFixed(1)} pp` : `${sign}${formatCurrency(d)}`;
}

function isCost(_label: string, isCost: boolean | undefined, value: number | null): boolean {
  return value !== null && (Boolean(isCost) || value < 0);
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
        color: row.delta === null ? COLORS.gray500 : isFavorableStatementDelta(row.delta, row.isCost) ? COLORS.positiveGreen : COLORS.costRed,
      }}>{fmtDelta(row.delta, row.isPercent)}</Text>
      <Text style={{
        width: cellWidth, textAlign: "right", fontSize: FONT_SIZES.xs, fontFamily: "Helvetica-Bold",
        color: row.deltaPct === null ? COLORS.gray500 : isFavorableStatementDelta(row.deltaPct, row.isCost) ? COLORS.positiveGreen : COLORS.costRed,
      }}>
        {row.deltaPct === null ? "—" : `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%`}
      </Text>
    </>
  );
}

export function IncomeStatementDocument(props: IncomeStatementDocumentProps) {
  const groups = props.isComparison ? [{ start: 0, months: props.filteredData }] : statementMonthChunks(props.filteredData);
  return (
    <Document title={`Estado de Resultados ${props.selectedYear}`}>
      {groups.map(({ start, months }) => <StatementPage key={start} {...props} filteredData={months}
        statementRows={props.statementRows.map((row) => ({ ...row, values: row.values.slice(start, start + months.length) }))}
      />)}
    </Document>
  );
}

function pageSegmentLabel(props: IncomeStatementDocumentProps): string {
  if (props.isComparison) return `Comparativo: ${props.availableYears.join(" / ")}`;
  if (!props.filteredData.length) return "Sin meses";
  return `Meses: ${props.filteredData[0].month} a ${props.filteredData.at(-1)?.month ?? ""}`;
}

function StatementPage(props: IncomeStatementDocumentProps) {
  const rows = props.isComparison ? props.comparisonRows : props.statementRows;
  const headers = props.isComparison
    ? [...props.yearTotals.map((y) => y.year), "Variación", "Var. %"]
    : [...props.filteredData.map((d) => d.month), "Total periodo"];
  // Landscape A4 = 842pt wide. After margins ~ 760pt. Label = 160. Cells share rest.
  const cellWidth = Math.min(90, Math.floor(580 / headers.length));
  const segment = pageSegmentLabel(props);
  const basis = !props.exportContext ? "Base no especificada" : props.exportContext.accountingBasis === "cash" ? "Efectivo" : "Devengado";

  return (
      <Page size="A4" orientation="landscape" style={sharedStyles.pageLandscape}>
        <AccentBar />
        <Text fixed style={{ position: "absolute", top: 13, left: 40, right: 40, fontSize: 6, color: COLORS.gray700 }}>
          {props.company?.razon_social ?? "Estado de resultados"} · {periodLabel(props)} · MXN · {basis} · {segment}
        </Text>
        <View style={sharedStyles.headerRow}>
          <View style={{ width: 380 }}>
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
          <View style={[sharedStyles.headerRight, { width: 330 }]}>
            <Text style={sharedStyles.headerKicker}>ESTADO DE RESULTADOS</Text>
            <Text style={sharedStyles.headerNumber}>{periodLabel(props)}</Text>
            <Text style={sharedStyles.headerMeta}>Emitido: {formatDateMty(nowMty())}</Text>
          </View>
        </View>
        <View style={sharedStyles.separator} />
        {props.exportContext && <View style={{ marginBottom: 8 }}>
          {statementContextLines(props.exportContext).map((line) => <Text key={line} style={{ fontSize: 7, color: COLORS.gray700, marginBottom: 2 }}>{line}</Text>)}
        </View>}

        <Text style={{ fontSize: 8, color: COLORS.gray700, marginBottom: 6 }}>
          {segment}. {props.isComparison ? "Variación entre los dos últimos años mostrados." : "Total periodo corresponde al rango completo seleccionado, no al subtotal de estos meses."}
        </Text>
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
  );
}
