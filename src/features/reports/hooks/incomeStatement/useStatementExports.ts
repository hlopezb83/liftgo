import { useLayoutEffect, useRef, useState } from "react";
import { exportToCsv } from "@/lib/exportCsv";
import { toYMD } from "@/lib/format/dateFormats";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import {
  statementPeriod,
  withStatementCsvContext,
  type IncomeStatementExportContext,
} from "@/lib/reports/incomeStatementPresentation";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { buildComparisonCsvRows } from "./statementRowFactories";
import type { useIncomeStatementData } from "../useIncomeStatementData";

type Props = ReturnType<typeof useIncomeStatementData> & {
  startDate: Date;
  endDate: Date;
  accountingBasis: "accrual" | "cash";
};

export function useStatementExports({
  startDate,
  endDate,
  accountingBasis,
  selectedYear,
  availableYears,
  isFetching,
  isPending,
  dataUpdatedAt,
  isError,
  isComparison,
  filteredData,
  statementRows,
  comparisonRows,
  yearTotals,
  csvRows,
  fxMissingCount,
  rentedWithoutCost,
  soldWithoutCost,
}: Props) {
  const [pdfLoading, setPdfLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const identityScope = useVerifiedIdentityScope();
  const exportKey = `${identityScope}:${toYMD(startDate)}:${toYMD(endDate)}:${accountingBasis}:${selectedYear}:${dataUpdatedAt}`;
  // A → B → A must never revive an in-flight export. Invalidate before passive effects.
  const exportEpoch = useRef(0);
  const exportReady = useRef(false);
  const validRange = startDate <= endDate;
  useLayoutEffect(() => {
    exportEpoch.current += 1;
    exportReady.current =
      Boolean(identityScope) &&
      !isFetching &&
      !isPending &&
      !isError &&
      validRange;
    return () => {
      exportReady.current = false;
      exportEpoch.current += 1;
    };
  }, [exportKey, identityScope, isFetching, isPending, isError, validRange]);
  const makeExportContext = (): IncomeStatementExportContext => ({
    accountingBasis,
    queryPeriodStart: toYMD(startDate),
    queryPeriodEnd: toYMD(endDate),
    ...statementPeriod(toYMD(startDate), toYMD(endDate), selectedYear),
    generatedAt: new Date().toISOString(),
    applicationVersion: import.meta.env.VITE_APP_VERSION,
    fxMissingCount,
    rentedWithoutCostCount: rentedWithoutCost.length,
    soldWithoutCostCount: soldWithoutCost.length,
  });
  // G-A1: el CSV debe reflejar lo que se ve en pantalla, no el detalle mensual crudo.
  const comparisonCsvRows = isComparison
    ? buildComparisonCsvRows(
        comparisonRows,
        yearTotals.map((yt) => yt.year),
      )
    : [];

  const handleExportPdf = async () => {
    if (!exportReady.current) return;
    const snapshotEpoch = exportEpoch.current;
    const exportContext = makeExportContext();
    setPdfLoading(true);
    try {
      // Lazy: keep @react-pdf/renderer out of the initial bundle.
      const { exportIncomeStatementPdf } =
        await import("@/lib/pdf/incomeStatement");
      await exportIncomeStatementPdf({
        filteredData,
        statementRows,
        comparisonRows,
        yearTotals,
        isComparison,
        selectedYear,
        availableYears,
        startDate,
        endDate,
        exportContext,
        shouldSave: () =>
          exportReady.current && exportEpoch.current === snapshotEpoch,
      });
      if (exportReady.current && exportEpoch.current === snapshotEpoch)
        notifySuccess("PDF descargado");
    } catch (err) {
      if (exportReady.current && exportEpoch.current === snapshotEpoch)
        notifyError({ error: err, message: "Error al generar PDF" });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (!exportReady.current) return;
    const snapshotEpoch = exportEpoch.current;
    const exportContext = makeExportContext();
    const rows = isComparison ? comparisonCsvRows : csvRows;
    setCsvLoading(true);
    try {
      const { fetchCompanyData } = await import("@/lib/pdf/shared");
      const { company } = await fetchCompanyData();
      if (!exportReady.current || exportEpoch.current !== snapshotEpoch) return;
      exportToCsv(
        isComparison
          ? "estado-resultados-comparativo.csv"
          : "estado-resultados.csv",
        withStatementCsvContext(rows, exportContext, company),
      );
      notifySuccess("CSV descargado");
    } catch (err) {
      if (exportReady.current && exportEpoch.current === snapshotEpoch)
        notifyError({ error: err, message: "Error al generar CSV" });
    } finally {
      setCsvLoading(false);
    }
  };

  return {
    handleExportPdf,
    handleExportCsv,
    pdfLoading,
    csvLoading,
    exportDisabled:
      !identityScope || isFetching || isPending || isError || !validRange,
    exportRows: isComparison ? comparisonCsvRows : csvRows,
  };
}
