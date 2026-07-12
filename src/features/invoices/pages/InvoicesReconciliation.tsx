import { startOfMonth, endOfMonth } from "date-fns";
import { toYMD } from "@/lib/format/dateFormats";
import { useState } from "react";
import { DownloadIcon, WarnIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { nowMty } from "@/lib/utils";
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

export default function InvoicesReconciliation() {
  const [filters, setFilters] = useState<ReconciliationFilters>(defaultFilters);
  const { data, isLoading } = useReconciliationData(filters);

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const kpis = [
      {
        label: "Total timbrado (producción)",
        value: formatCurrency(summary?.totalStampedLive ?? 0),
      },
      { label: "Timbradas", value: String(summary?.countStamped ?? 0) },
      { label: "Canceladas", value: String(summary?.countCancelled ?? 0) },
      { label: "Borradores", value: String(summary?.countDraft ?? 0) },
    ];

  return (
    <PageContainer maxWidth="wide" className="space-y-6">
      <PageHeader
        title="Conciliación de facturas"
        subtitle="Cruce entre folio interno LiftGo, ID de Facturapi y UUID SAT."
        actions={
          <Button
            variant="outline"
            onClick={() => downloadReconciliationXlsx(rows)}
            disabled={rows.length === 0}
          >
            <DownloadIcon className="h-4 w-4 mr-2" /> Exportar XLSX
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label htmlFor="from">Desde</Label>
            <Input
              id="from"
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to">Hasta</Label>
            <Input
              id="to"
              type="date"
              value={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>Estado fiscal</Label>
            <Select
              value={filters.fiscalState}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, fiscalState: v as ReconciliationFilters["fiscalState"] }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="stamped">Timbradas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
                <SelectItem value="draft">Borradores</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ambiente PAC</Label>
            <Select
              value={filters.env}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, env: v as ReconciliationFilters["env"] }))
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="live">Producción</SelectItem>
                <SelectItem value="test">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="py-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-lg font-semibold font-mono">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary && summary.gaps.length > 0 && (
        <Alert>
          <WarnIcon className="h-4 w-4" />
          <AlertDescription>
            Folios internos faltantes en el rango: {summary.gaps.map((g) => `FAC-${g}`).join(", ")}.
            Puede ser normal si esos folios se emitieron fuera del rango, o indicar folios cancelados/eliminados.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <ReconciliationTable rows={rows} isLoading={isLoading} />
        </CardContent>
      </Card>

    </PageContainer>
  );
}
