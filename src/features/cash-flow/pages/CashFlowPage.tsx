import { useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { SpinnerIcon, TrendingUpIcon } from "@/components/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { RoleGuard } from "@/layouts/RoleGuard";
import { CashFlowSettingsBar } from "../components/CashFlowSettingsBar";
import { CashFlowSummaryCards } from "../components/CashFlowSummaryCards";
import { CashFlowTable } from "../components/CashFlowTable";
import { CashFlowWeekDetailSheet } from "../components/CashFlowWeekDetailSheet";
import { useCashFlowProjection } from "../hooks/useCashFlowProjection";
import { useCashFlowSettings } from "../hooks/useCashFlowSettings";
import type { CashFlowBucket } from "../lib/cashFlowUtils";

/** F4: aviso de documentos excluidos de la proyección. */
function ExcludedNotice({ noDueDate, outOfHorizon }: { noDueDate: number; outOfHorizon: number }) {
  if (noDueDate === 0 && outOfHorizon === 0) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid="cash-flow-excluded-notice">
      {noDueDate > 0 && `${noDueDate} documento(s) sin fecha de vencimiento excluidos de la proyección. `}
      {outOfHorizon > 0 && `${outOfHorizon} documento(s) vencen fuera del horizonte seleccionado.`}
    </p>
  );
}

export default function CashFlowPage() {
  const [weeks, setWeeks] = useState(8);
  const [selected, setSelected] = useState<CashFlowBucket | null>(null);

  const { data: settings } = useCashFlowSettings();
  const initialBalance = settings?.initialBalance ?? 0;
  const safetyBuffer = settings?.safetyBuffer ?? 0;

  const { data: projection, isLoading, isError, isFetching, refetch } = useCashFlowProjection({
    weeks,
    initialBalance,
    safetyBuffer,
  });
  const buckets = projection?.buckets;
  const excludedNoDueDate = projection?.excludedNoDueDate ?? 0;
  const excludedOutOfHorizon = projection?.excludedOutOfHorizon ?? 0;

  return (
    <RoleGuard module="Flujo de Caja" minAccess="read">
      <PageTransition>
        <PageContainer>
          <PageHeader
            title="Flujo de caja proyectado"
            subtitle="Entradas esperadas vs salidas por semana, con semáforo de liquidez"
          />
          <CashFlowSettingsBar weeks={weeks} onChangeWeeks={setWeeks} />

          {isError ? (
            <QueryErrorState entity="la proyección de flujo de caja" onRetry={() => refetch()} isRetrying={isFetching} />
          ) : isLoading || !buckets ? (
            <Card><CardContent className="py-12 flex items-center justify-center text-muted-foreground">
              <SpinnerIcon className="h-5 w-5 animate-spin mr-2" /> Calculando proyección…
            </CardContent></Card>
          ) : (
            <>
              <ExcludedNotice noDueDate={excludedNoDueDate} outOfHorizon={excludedOutOfHorizon} />
              <CashFlowSummaryCards buckets={buckets} initialBalance={initialBalance} />
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  {buckets.every((b) => b.items.length === 0) ? (
                    <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <TrendingUpIcon className="h-8 w-8" />
                      <p className="text-sm">No hay facturas ni cuentas por pagar en el horizonte seleccionado.</p>
                    </div>
                  ) : (
                    <CashFlowTable
                      buckets={buckets}
                      onSelect={(b) => { setSelected(b); }}
                    />
                  )}
                </CardContent>
              </Card>
            </>
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
