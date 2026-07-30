import { Badge } from "@/components/ui/badge";
import { useMaintenanceParts } from "@/features/inventory";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useMaintenanceLabor } from "../../hooks/maintenance/useMaintenanceLabor";

interface Props {
  maintenanceLogId: string;
  manualCost: number;
}

/** Resumen económico de la OT que se muestra antes de confirmar el cierre. */
export function WorkOrderCloseSummary({ maintenanceLogId, manualCost }: Props) {
  const { data: parts = [] } = useMaintenanceParts(maintenanceLogId);
  const { data: labor = [] } = useMaintenanceLabor(maintenanceLogId);

  const partsCost = parts.reduce((sum, p) => sum + p.quantity_used * p.cost_at_time, 0);
  const laborHours = labor.reduce((sum, l) => sum + Number(l.hours ?? 0), 0);
  const laborCost = labor.reduce((sum, l) => sum + Number(l.total_cost ?? 0), 0);
  const total = partsCost + laborCost + manualCost;

  const rows = [
    { label: `Refacciones (${parts.length})`, value: partsCost },
    { label: `Mano de obra (${laborHours.toLocaleString("es-MX")} h)`, value: laborCost },
    { label: "Costo manual", value: manualCost },
  ];

  return (
    <div className="rounded-md border bg-muted/40 divide-y">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-mono">{formatCurrency(r.value)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium">Costo total</span>
        <Badge variant="secondary" className="font-mono text-base">{formatCurrency(total)}</Badge>
      </div>
    </div>
  );
}
