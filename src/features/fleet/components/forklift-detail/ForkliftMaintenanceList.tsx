import { format } from "date-fns";
import { MaintenanceIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { parseDateLocal } from "@/lib/utils";

interface ForkliftMaintenanceListProps {
  logs: Tables<"maintenance_logs">[];
}

export function ForkliftMaintenanceList({ logs }: ForkliftMaintenanceListProps) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MaintenanceIcon className="h-4 w-4" /> Historial de Mantenimiento</CardTitle></CardHeader>
      <CardContent>
        {logs.length > 0 ? (
          <div className="space-y-2">
            {logs.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium">{m.service_type}</span>
                  {m.performed_by && <span className="text-muted-foreground ml-2">por {m.performed_by}</span>}
                  {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs text-muted-foreground">{format(parseDateLocal(m.performed_at), "dd/MM/yyyy")}</span>
                  {m.cost ? <p className="text-xs font-medium">{formatCurrency(m.cost)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin registros de mantenimiento</p>
        )}
      </CardContent>
    </Card>
  );
}
