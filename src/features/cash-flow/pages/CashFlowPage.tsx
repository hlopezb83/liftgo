import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp } from "@/components/icons";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleGuard } from "@/layouts/RoleGuard";
import { CashFlowSettingsBar } from "../components/CashFlowSettingsBar";
import { CashFlowSummaryCards } from "../components/CashFlowSummaryCards";
import { CashFlowTable } from "../components/CashFlowTable";
import { CashFlowWeekDetailSheet } from "../components/CashFlowWeekDetailSheet";
import { useCashFlowSettings } from "../hooks/useCashFlowSettings";
import { useCashFlowProjection } from "../hooks/useCashFlowProjection";
import type { CashFlowBucket } from "../lib/cashFlowUtils";

export default function CashFlowPage() {
  const [weeks, setWeeks] = useState(8);
  const [selected, setSelected] = useState<CashFlowBucket | null>(null);

  const { data: settings } = useCashFlowSettings();
  const initialBalance = settings?.initialBalance ?? 0;
  const safetyBuffer = settings?.safetyBuffer ?? 0;

  const { data: buckets, isLoading } = useCashFlowProjection({
    weeks,
    initialBalance,
    safetyBuffer,
  });

  return (
    <RoleGuard module="Facturas de Proveedor" minAccess="read">
      <PageTransition>
        <PageContainer>
          <PageHeader
            title="Flujo de caja proyectado"
            subtitle="Entradas esperadas vs salidas por semana, con semáforo de liquidez"
          />
          <CashFlowSettingsBar weeks={weeks} onChangeWeeks={setWeeks} />

          {isLoading || !buckets ? (
            <Card><CardContent className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Calculando proyección…
            </CardContent></Card>
          ) : (
            <>
              <CashFlowSummaryCards buckets={buckets} initialBalance={initialBalance} />
              <Card>
                <CardContent className="p-0">
                  {buckets.every((b) => b.items.length === 0) ? (
                    <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <TrendingUp className="h-8 w-8" />
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
