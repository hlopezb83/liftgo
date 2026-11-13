import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { useMaintenanceParts } from "@/features/inventory";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { roundMoney, sumMoney } from "@/lib/money";
import { useMaintenanceLabor } from "../../hooks/maintenance/useMaintenanceLabor";

interface Props {
  maintenanceLogId: string;
  /** Costo total persistido (maintenance_logs.cost = manual + refacciones + MO). */
  storedCost: number;
  /** Componente manual declarado (maintenance_logs.manual_cost). */
  manualCost: number;
}

/** Resumen económico de la OT que se muestra antes de confirmar el cierre. */
export function WorkOrderCloseSummary({ maintenanceLogId, storedCost, manualCost }: Props) {
  const partsQuery = useMaintenanceParts(maintenanceLogId);
  const laborQuery = useMaintenanceLabor(maintenanceLogId);
  const isFetching = partsQuery.isFetching || laborQuery.isFetching;
  const hasError = partsQuery.isError || laborQuery.isError;

  // Un refetch fallido puede conservar data en caché. Ese desglose tampoco
  // confirma el total actual: mostramos únicamente el último total persistido.
  if (!partsQuery.isSuccess || !laborQuery.isSuccess || isFetching) {
    return (
      <div className="rounded-md border bg-muted/40 divide-y">
        {hasError && (
          <QueryErrorState
            bare
            entity="el desglose del servicio"
            error={partsQuery.error ?? laborQuery.error}
            isRetrying={isFetching}
            onRetry={() => {
              void partsQuery.refetch();
              void laborQuery.refetch();
            }}
          />
        )}
        {(isFetching || !hasError) && (
          <p role="status" className="px-3 py-2 text-sm text-muted-foreground">Cargando desglose…</p>
        )}
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-sm font-medium">Último total registrado</span>
          <Badge variant="secondary" className="tabular-nums text-base">{formatCurrency(storedCost)}</Badge>
        </div>
      </div>
    );
  }

  const parts = partsQuery.data;
  const labor = laborQuery.data;

  // Ronda D·#3: sumas monetarias con sumMoney (centavos) para evitar drift IEEE-754.
  const partsCost = sumMoney(parts.map((p) => roundMoney(p.quantity_used * p.cost_at_time)));
  const laborHours = labor.reduce((sum, l) => sum + Number(l.hours ?? 0), 0);
  const laborCost = sumMoney(labor.map((l) => Number(l.total_cost ?? 0)));
  // R13-FE-02 (P1): `cost` ya incluye refacciones + mano de obra (trigger
  // recalc_maintenance_log_cost). Si manual_cost = 0, el componente "otros" es
  // el residual — nunca el cost completo, que duplicaría parts + labor.
  const otherCost = manualCost > 0 ? manualCost : Math.max(0, sumMoney([storedCost, -partsCost, -laborCost]));
  const total = sumMoney([partsCost, laborCost, otherCost]);

  const rows = [
    { label: `Refacciones (${parts.length})`, value: partsCost },
    { label: `Mano de obra (${laborHours.toLocaleString("es-MX")} h)`, value: laborCost },
    { label: manualCost > 0 ? "Costo manual" : "Otros costos", value: otherCost },
  ];

  return (
    <div className="rounded-md border bg-muted/40 divide-y">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="tabular-nums">{formatCurrency(r.value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium">Costo total</span>
        <Badge variant="secondary" className="tabular-nums text-base">{formatCurrency(total)}</Badge>
      </div>
    </div>
  );
}
