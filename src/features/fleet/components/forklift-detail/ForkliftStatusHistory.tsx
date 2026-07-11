import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "@/components/icons";
import { format } from "date-fns";

import type { Tables } from "@/integrations/supabase/types";

interface ForkliftStatusHistoryProps {
  logs: Tables<"status_logs">[];
}

export function ForkliftStatusHistory({ logs }: ForkliftStatusHistoryProps) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Historial de Estado</CardTitle></CardHeader>
      <CardContent>
        {logs.length > 0 ? (
          <div className="space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">{log.from_status || "—"}</span>
                  <span className="text-muted-foreground mx-1">→</span>
                  <span className="font-medium">{log.to_status}</span>
                  {log.note && <span className="text-muted-foreground ml-2">— {log.note}</span>}
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(log.changed_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin historial aún</p>
        )}
      </CardContent>
    </Card>
  );
}
