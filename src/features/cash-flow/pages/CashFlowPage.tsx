import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TableSkeleton } from "@/components/feedback/TableSkeleton";
import { TrendingUpIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleGuard } from "@/layouts/RoleGuard";
import { CashFlowSettingsBar } from "../components/CashFlowSettingsBar";
import { CashFlowSummaryCards } from "../components/CashFlowSummaryCards";
import { CashFlowTable } from "../components/CashFlowTable";
import { CashFlowWeekDetailSheet } from "../components/CashFlowWeekDetailSheet";
import { useCashFlowProjection } from "../hooks/useCashFlowProjection";
import { useCashFlowSettings } from "../hooks/useCashFlowSettings";
import type { CashFlowBucket } from "../lib/cashFlowUtils";

/** F4: aviso de documentos excluidos de la proyección. */
function ExcludedNotice({ noDueDate, outOfHorizon, recurringCoverage }: { noDueDate: number; outOfHorizon: number; recurringCoverage: number }) {
  if (noDueDate === 0 && outOfHorizon === 0 && recurringCoverage === 0) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="cash-flow-excluded-notice">
      {noDueDate > 0 && `${noDueDate} documento(s) sin fecha de vencimiento excluidos de la proyección. `}
      {outOfHorizon > 0 && `${outOfHorizon} documento(s) vencen fuera del horizonte seleccionado.`}
      {recurringCoverage > 0 && ` ${recurringCoverage} reserva(s) tienen períodos omitidos de la proyección porque su cobertura facturada no se pudo verificar. Revisa su historial de facturas.`}
    </p>
  );
}

function CashFlowBody({
  buckets, loading, initialBalance, noDueDate, outOfHorizon, recurringCoverage, onSelect,
}: {
  buckets?: CashFlowBucket[];
  loading: boolean;
  initialBalance: number;
  noDueDate: number;
  outOfHorizon: number;
  recurringCoverage: number;
  onSelect: (bucket: CashFlowBucket) => void;
}) {
  if (loading || !buckets) {
    return <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
      <Card><CardContent className="p-0"><TableSkeleton columnCount={7} rows={8} /></CardContent></Card>
    </>;
  }

  return <>
    <ExcludedNotice noDueDate={noDueDate} outOfHorizon={outOfHorizon} recurringCoverage={recurringCoverage} />
    <CashFlowSummaryCards buckets={buckets} initialBalance={initialBalance} />
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        {buckets.every((b) => b.items.length === 0) ? (
          <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
            <TrendingUpIcon className="h-8 w-8" />
            <p className="text-sm">No hay facturas ni cuentas por pagar en el horizonte seleccionado.</p>
          </div>
        ) : <CashFlowTable buckets={buckets} onSelect={onSelect} />}
      </CardContent>
    </Card>
  </>;
}

export default function CashFlowPage() {
  const [weeks, setWeeks] = useState(8);
  const [selected, setSelected] = useState<CashFlowBucket | null>(null);

  const {
    data: settings,
    isPending: settingsPending,
    isError: settingsError,
    isFetching: settingsFetching,
    refetch: refetchSettings,
  } = useCashFlowSettings();
  const initialBalance = settings?.initialBalance ?? 0;
  const safetyBuffer = settings?.safetyBuffer ?? 0;

  const { data: projection, isLoading, isError, isFetching, refetch } = useCashFlowProjection({
    weeks,
    initialBalance,
    safetyBuffer,
    enabled: !!settings && !settingsError,
  });
  const {
    buckets,
    excludedNoDueDate = 0,
    excludedOutOfHorizon = 0,
    excludedRecurringCoverage = 0,
  } = projection ?? {};

  return (
    <RoleGuard module="Flujo de Caja" minAccess="read">
      <PageTransition>
        <PageContainer>
          <PageHeader
            title="Flujo de caja proyectado"
            subtitle="Entradas esperadas vs salidas por semana, con semáforo de liquidez"
          />
          {!settingsError && <CashFlowSettingsBar weeks={weeks} onChangeWeeks={setWeeks} />}

          {settingsError ? (
            <QueryErrorState entity="la configuración de flujo de caja" onRetry={() => { void refetchSettings(); }} isRetrying={settingsFetching} />
          ) : isError ? (
            <QueryErrorState entity="la proyección de flujo de caja" onRetry={() => refetch()} isRetrying={isFetching} />
          ) : (
            <CashFlowBody
              buckets={buckets}
              loading={settingsPending || isLoading}
              initialBalance={initialBalance}
              noDueDate={excludedNoDueDate}
              outOfHorizon={excludedOutOfHorizon}
              recurringCoverage={excludedRecurringCoverage}
              onSelect={setSelected}
            />
          )}

          <CashFlowWeekDetailSheet
            bucket={selected}
            open={!!selected}
            onOpenChange={(o) => { if (!o) setSelected(null); }}
          />
        </PageContainer>
      </PageTransition>
    </RoleGuard>
  );
}
