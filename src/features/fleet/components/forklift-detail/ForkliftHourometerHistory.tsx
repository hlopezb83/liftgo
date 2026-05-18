import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { formatDateDisplay } from "@/lib/utils";
import type { ForkliftFinancials } from "@/features/fleet/hooks/forklifts/useForkliftFinancials";
import { DataTable } from "@/components/DataTable";

interface ForkliftHourometerHistoryProps {
  history: ForkliftFinancials["hourometer_history"];
}

export function ForkliftHourometerHistory({ history }: ForkliftHourometerHistoryProps) {
  if (!history || history.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Historial de Horómetro
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          data={history}
          keyExtractor={(e) => e.delivery_id}
          emptyMessage="Sin lecturas de horómetro"
          defaultSortKey="date"
          defaultSortDirection="desc"
          columns={[
            { key: "date", label: "Fecha", sortable: true, render: (e) => <span className="text-sm">{formatDateDisplay(e.date)}</span> },
            { key: "delivery_number", label: "Entrega", sortable: true, render: (e) => <span className="text-sm font-mono">{e.delivery_number}</span> },
            { key: "type", label: "Tipo", sortable: true, render: (e) => <span className="text-sm">{e.type === "delivery" ? "Entrega" : "Recolección"}</span> },
            { key: "hours_reading", label: "Lectura (hrs)", align: "right", sortable: true, render: (e) => <span className="font-mono font-semibold">{e.hours_reading}</span> },
          ]}
        />
      </CardContent>
    </Card>
  );
}
