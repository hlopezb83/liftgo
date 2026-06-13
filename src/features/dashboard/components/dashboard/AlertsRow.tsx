import { AlertTriangle, Wrench, CheckCircle, ClipboardList, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUpdateInvoice } from "@/features/invoices";
import { useUpdateBooking } from "@/features/bookings";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { toast } from "sonner";
import { formatDateDisplay, nowMty } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";
import { AlertCard, AlertRow } from "./AlertCard";

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

interface AgingBucket { range: string; total: number }

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
      { id: inv.id, status: "paid", paid_at: toYMD(nowMty()) },
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
        <AlertCard
          icon={AlertTriangle}
          title="Facturas Vencidas"
          count={overdueInvoices.length}
          tone="destructive"
          footer={agingBuckets.length > 0 ? (
            <div className="flex gap-2 pt-2 border-t">
              {agingBuckets.map((b) => (
                <div key={b.range} className="text-xs bg-background rounded px-2 py-1">
                  <span className="text-muted-foreground">{b.range}d:</span>{" "}
                  <span className="font-mono font-medium">{formatCurrency(b.total)}</span>
                </div>
              ))}
            </div>
          ) : null}
        >
          {overdueInvoices.slice(0, 5).map((inv) => (
            <AlertRow
              key={inv.id}
              primary={inv.invoice_number}
              secondary={inv.customer_name}
              onClick={() => navigate(`/invoices/${inv.id}`)}
              rightTop={<span className="font-mono font-semibold text-destructive">{formatCurrency(Number(inv.total))}</span>}
              rightBottom={`Vence: ${formatDateDisplay(inv.due_date)}`}
              action={{ icon: CheckCircle, title: "Marcar Pagada", onClick: (e) => handleMarkPaid(inv, e), className: "text-status-available" }}
            />
          ))}
        </AlertCard>
      )}

      {overdueBookings.length > 0 && (
        <AlertCard icon={Clock} title="Rentas Vencidas" count={overdueBookings.length} tone="warning">
          {overdueBookings.slice(0, 5).map((ob) => (
            <AlertRow
              key={ob.booking_id}
              primary={ob.forklift_name}
              secondary={ob.customer_name}
              onClick={() => navigate(`/returns?booking_id=${ob.booking_id}`)}
              rightTop={<span className="font-mono font-semibold text-orange-600">{ob.days_overdue} días</span>}
              rightBottom={`Venció: ${formatDateDisplay(ob.end_date)}`}
              action={{
                icon: ClipboardList,
                title: "Registrar Devolución",
                onClick: (e) => { e.stopPropagation(); navigate(`/returns?booking_id=${ob.booking_id}`); },
                className: "text-orange-600",
              }}
            />
          ))}
        </AlertCard>
      )}

      {maintenanceAlerts.length > 0 && (
        <AlertCard icon={Wrench} title="Servicio Pendiente" count={maintenanceAlerts.length} tone="maintenance">
          {maintenanceAlerts.map((a) => (
            <AlertRow
              key={a.forkliftId}
              primary={a.forkliftName}
              onClick={() => navigate(`/fleet/${a.forkliftId}`)}
              rightTop={<span className="text-xs text-muted-foreground">Vence: {a.nextDate}</span>}
              action={{
                icon: ClipboardList,
                title: "Registrar Servicio",
                onClick: (e) => { e.stopPropagation(); navigate("/maintenance"); },
                className: "text-status-maintenance",
              }}
            />
          ))}
        </AlertCard>
      )}
    </div>
  );
}
