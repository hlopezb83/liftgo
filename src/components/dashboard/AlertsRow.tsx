import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Wrench } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/formatCurrency";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total: number;
  due_date: string | null;
}

interface MaintenanceAlert {
  forkliftName: string;
  nextDate: string;
  forkliftId: string;
}

interface AgingBucket {
  range: string;
  total: number;
}

interface AlertsRowProps {
  overdueInvoices: OverdueInvoice[];
  maintenanceAlerts: MaintenanceAlert[];
  agingBuckets: AgingBucket[];
}

export function AlertsRow({ overdueInvoices, maintenanceAlerts, agingBuckets }: AlertsRowProps) {
  const navigate = useNavigate();

  if (overdueInvoices.length === 0 && maintenanceAlerts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {overdueInvoices.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Overdue Invoices ({overdueInvoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueInvoices.slice(0, 5).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background"
                onClick={() => navigate(`/invoices/${inv.id}`)}
              >
                <div>
                  <span className="font-medium">{inv.invoice_number}</span>
                  <span className="text-muted-foreground ml-2">{inv.customer_name}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-semibold text-destructive">{formatCurrency(Number(inv.total))}</span>
                  <p className="text-xs text-muted-foreground">Due: {inv.due_date}</p>
                </div>
              </div>
            ))}
            {agingBuckets.length > 0 && (
              <div className="flex gap-2 pt-2 border-t">
                {agingBuckets.map((b) => (
                  <div key={b.range} className="text-xs bg-background rounded px-2 py-1">
                    <span className="text-muted-foreground">{b.range}d:</span>{" "}
                    <span className="font-mono font-medium">€{b.total.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {maintenanceAlerts.length > 0 && (
        <Card className="border-status-maintenance/30 bg-status-maintenance/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-status-maintenance">
              <Wrench className="h-4 w-4" /> Service Due ({maintenanceAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {maintenanceAlerts.map((a) => (
              <div
                key={a.forkliftId}
                className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background"
                onClick={() => navigate(`/fleet/${a.forkliftId}`)}
              >
                <span className="font-medium">{a.forkliftName}</span>
                <span className="text-xs text-muted-foreground">Due: {a.nextDate}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
