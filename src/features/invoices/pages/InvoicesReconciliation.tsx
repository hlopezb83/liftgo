import { startOfMonth, endOfMonth } from "date-fns";
import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { DownloadIcon, WarnIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toYMD } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { nowMty } from "@/lib/utils";
import { ReconciliationFilterBar } from "../components/reconciliation/ReconciliationFilterBar";
import { ReconciliationTable } from "../components/reconciliation/ReconciliationTable";
import {
  useReconciliationData,
  type ReconciliationFilters,
} from "../hooks/reconciliation/useReconciliationData";
import { downloadReconciliationXlsx } from "../lib/reconciliationExport";

function defaultFilters(): ReconciliationFilters {
  const today = nowMty();
  return {
    from: toYMD(startOfMonth(today)),
    to: toYMD(endOfMonth(today)),
    fiscalState: "all",
    env: "all",
  };
}

type ReconciliationSummary = NonNullable<
  ReturnType<typeof useReconciliationData>["data"]
>["summary"];

function buildKpis(summary: ReconciliationSummary | undefined): { label: string; value: string }[] {
  return [
    { label: "Total timbrado (producción, MXN)", value: formatCurrency(summary?.totalStampedLive ?? 0) },
    { label: "Timbradas", value: String(summary?.countStamped ?? 0) },
    { label: "Canceladas", value: String(summary?.countCancelled ?? 0) },
    { label: "Borradores", value: String(summary?.countDraft ?? 0) },
  ];
}


export default function InvoicesReconciliation() {
  const [filters, setFilters] = useState<ReconciliationFilters>(defaultFilters);
  const { data, isLoading, isError, refetch } = useReconciliationData(filters);

  const rows = data?.rows ?? [];
  const summary = data?.summary;
  // A3-03: validación inline del rango — la query con from>to devuelve
  // vacío y el usuario creía que no había facturas en el periodo.
  const invalidRange = filters.from !== "" && filters.to !== "" && filters.from > filters.to;

  const kpis = buildKpis(summary);


  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title="Conciliación de facturas"
        subtitle="Cruce entre folio interno LiftGo, ID de Facturapi y UUID SAT."
        actions={
          <Button
            variant="outline"
            onClick={() => { void downloadReconciliationXlsx(rows); }}
            disabled={rows.length === 0 || isError}
          >
            <DownloadIcon className="h-4 w-4 mr-2" /> Exportar XLSX
          </Button>
        }
      />

      <ReconciliationFilterBar filters={filters} invalidRange={invalidRange} onChange={setFilters} />

      {isError ? (
        <QueryErrorState
          entity="la conciliación de facturas"
          onRetry={() => { void refetch(); }}
        />
      ) : (
      <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-lg font-semibold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary && summary.countStampedMissingFx > 0 && (
        <Alert>
          <WarnIcon className="h-4 w-4" />
          <AlertDescription>
            {summary.countStampedMissingFx} factura(s) timbrada(s) sin tipo de cambio fueron
            excluidas del total timbrado (MXN). Captura el tipo de cambio para incluirlas.
          </AlertDescription>
        </Alert>
      )}

      {summary && summary.missingFolioCount > 0 && (
        <Alert>
          <WarnIcon className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium">
              {summary.missingFolioCount.toLocaleString("es-MX")} folio(s) interno(s) faltante(s) en el rango.
            </p>
            {summary.missingFolioPreview.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer select-none underline underline-offset-4">
                  Ver {summary.missingFolioPreview.length.toLocaleString("es-MX")} folios
                  {summary.missingFolioPreview.length < summary.missingFolioCount
                    ? ` (primeros ${summary.missingFolioPreview.length.toLocaleString("es-MX")})`
                    : ""}
                </summary>
                <p className="mt-1 max-h-36 overflow-y-auto break-words text-xs">
                  {summary.missingFolioPreview.map((folio) => `FAC-${folio}`).join(", ")}
                  {summary.missingFolioPreview.length < summary.missingFolioCount ? ", …" : ""}
                </p>
              </details>
            )}
            <p className="mt-2 text-sm">
              Puede ser normal si esos folios se emitieron fuera del rango, o indicar folios cancelados/eliminados.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <ReconciliationTable rows={rows} isLoading={isLoading} />
        </CardContent>
      </Card>
      </>
      )}

    </PageContainer>
  );
}
