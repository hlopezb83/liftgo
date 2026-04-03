import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Wrench, CheckCircle, ClipboardList, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUpdateInvoice } from "@/hooks/useInvoices";
import { useUpdateBooking } from "@/hooks/useBookings";
import { formatCurrency } from "@/lib/formatCurrency";
import { toast } from "sonner";
import { formatDateDisplay, nowMty } from "@/lib/utils";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total: number;
  due_date: string | null;
  booking_id?: string | null;
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

interface OverdueBooking {
  booking_id: string;
  forklift_name: string;
  forklift_id: string;
  customer_name: string | null;
  end_date: string;
  days_overdue: number;
}

interface AlertsRowProps {
  overdueInvoices: OverdueInvoice[];
  maintenanceAlerts: MaintenanceAlert[];
  agingBuckets: AgingBucket[];
  overdueBookings: OverdueBooking[];
}

export function AlertsRow({ overdueInvoices, maintenanceAlerts, agingBuckets, overdueBookings }: AlertsRowProps) {
  const navigate = useNavigate();
  const updateInvoice = useUpdateInvoice();
  const updateBooking = useUpdateBooking();

  if (overdueInvoices.length === 0 && maintenanceAlerts.length === 0 && overdueBookings.length === 0) return null;

  const handleMarkPaid = (inv: OverdueInvoice, e: React.MouseEvent) => {
    e.stopPropagation();
    updateInvoice.mutate(
      { id: inv.id, status: "paid", paid_at: nowMty().toISOString().split("T")[0] },
      {
        onSuccess: (data) => {
          toast.success(`${inv.invoice_number} marcada como pagada`);
          if (data.booking_id) {
            updateBooking.mutate(
              { id: data.booking_id, status: "completed" },
              { onSuccess: () => toast.success("Reserva vinculada completada") }
            );
          }
        },
      }
    );
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {overdueInvoices.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Facturas Vencidas ({overdueInvoices.length})
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
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-mono font-semibold text-destructive">{formatCurrency(Number(inv.total))}</span>
                    <p className="text-xs text-muted-foreground">Vence: {formatDateDisplay(inv.due_date)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => handleMarkPaid(inv, e)}
                    title="Marcar Pagada"
                  >
                    <CheckCircle className="h-4 w-4 text-status-available" />
                  </Button>
                </div>
              </div>
            ))}
            {agingBuckets.length > 0 && (
              <div className="flex gap-2 pt-2 border-t">
                {agingBuckets.map((b) => (
                  <div key={b.range} className="text-xs bg-background rounded px-2 py-1">
                    <span className="text-muted-foreground">{b.range}d:</span>{" "}
                    <span className="font-mono font-medium">{formatCurrency(b.total)}</span>
                  </div>
                ))}
              </div>
      )}

      {overdueBookings.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-orange-600">
              <Clock className="h-4 w-4" /> Rentas Vencidas ({overdueBookings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueBookings.slice(0, 5).map((ob) => (
              <div
                key={ob.booking_id}
                className="flex items-center justify-between p-2 rounded-lg bg-background/80 text-sm cursor-pointer hover:bg-background"
                onClick={() => navigate(`/returns?booking_id=${ob.booking_id}`)}
              >
                <div>
                  <span className="font-medium">{ob.forklift_name}</span>
                  <span className="text-muted-foreground ml-2">{ob.customer_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-mono font-semibold text-orange-600">{ob.days_overdue} días</span>
                    <p className="text-xs text-muted-foreground">Venció: {formatDateDisplay(ob.end_date)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => { e.stopPropagation(); navigate(`/returns?booking_id=${ob.booking_id}`); }}
                    title="Registrar Devolución"
                  >
                    <ClipboardList className="h-4 w-4 text-orange-600" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
          </CardContent>
        </Card>
      )}

      {maintenanceAlerts.length > 0 && (
        <Card className="border-status-maintenance/30 bg-status-maintenance/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-status-maintenance">
              <Wrench className="h-4 w-4" /> Servicio Pendiente ({maintenanceAlerts.length})
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Vence: {a.nextDate}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={(e) => { e.stopPropagation(); navigate("/maintenance"); }}
                    title="Registrar Servicio"
                  >
                    <ClipboardList className="h-4 w-4 text-status-maintenance" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
