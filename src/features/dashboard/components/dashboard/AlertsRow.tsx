import { MaintenanceIcon, SuccessIcon, ClipboardList, OverdueIcon } from "@/components/icons";
import { useUpdateBooking } from "@/features/bookings";
import { useUpdateInvoice } from "@/features/invoices";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { toYMD } from "@/lib/date/toYMD";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { formatDateDisplay, nowMty } from "@/lib/utils";
import { AlertCard, AlertRow } from "./AlertCard";
import type { MouseEvent as ReactMouseEvent } from "react";

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
  const navigate = useNavigateTransition();
  const updateInvoice = useUpdateInvoice();
  const updateBooking = useUpdateBooking();

  if (overdueInvoices.length === 0 && maintenanceAlerts.length === 0 && overdueBookings.length === 0) return null;

  const handleMarkPaid = (inv: OverdueInvoice, e: ReactMouseEvent) => {
    e.stopPropagation();
    updateInvoice.mutate(
      { id: inv.id, status: "paid", paid_at: toYMD(nowMty()) },
      {
        onSuccess: (data) => {
          notifySuccess(`${inv.invoice_number} marcada como pagada`);
          if (data.booking_id) {
            updateBooking.mutate(
              { id: data.booking_id, status: "completed" },
              { onSuccess: () => notifySuccess("Reserva vinculada completada") }
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
          icon={OverdueIcon}
          title="Facturas Vencidas"
          count={overdueInvoices.length}
          tone="destructive"
          footer={
            <div className="space-y-2 pt-2 border-t">
              {agingBuckets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {agingBuckets.map((b) => (
                    <div key={b.range} className="text-2xs bg-background rounded px-2 py-1">
                      <span className="text-muted-foreground">{b.range}d:</span>{" "}
                      <span className="font-mono font-medium">{formatCurrency(b.total)}</span>
                    </div>
                  ))}
                </div>
              )}
              {overdueInvoices.length > 3 && (
                <button
                  type="button"
                  onClick={() => navigate("/invoices?status=overdue")}
                  className="text-xs text-destructive hover:underline font-medium"
                >
                  Ver las {overdueInvoices.length} facturas vencidas →
                </button>
              )}
            </div>
          }
        >
          {overdueInvoices.slice(0, 3).map((inv) => (
            <AlertRow
              key={inv.id}
              primary={inv.invoice_number}
              secondary={inv.customer_name}
              onClick={() => navigate(`/invoices/${inv.id}`)}
              rightTop={<span className="font-mono font-semibold text-destructive text-sm sm:text-base whitespace-nowrap">{formatCurrency(Number(inv.total))}</span>}
              rightBottom={`Vence: ${formatDateDisplay(inv.due_date)}`}
              action={{ icon: SuccessIcon, title: "Marcar Pagada", onClick: (e) => handleMarkPaid(inv, e), className: "text-status-available" }}
            />
          ))}
        </AlertCard>
      )}


      {overdueBookings.length > 0 && (
        <AlertCard icon={OverdueIcon} title="Rentas Vencidas" count={overdueBookings.length} tone="warning">
          {overdueBookings.slice(0, 5).map((ob) => (
            <AlertRow
              key={ob.booking_id}
              primary={ob.forklift_name}
              secondary={ob.customer_name}
              onClick={() => navigate(`/returns?booking_id=${ob.booking_id}`)}
              rightTop={<span className="font-mono font-semibold text-warning whitespace-nowrap">{ob.days_overdue} días</span>}
              rightBottom={`Venció: ${formatDateDisplay(ob.end_date)}`}
              action={{
                icon: ClipboardList,
                title: "Registrar Devolución",
                onClick: (e) => { e.stopPropagation(); navigate(`/returns?booking_id=${ob.booking_id}`); },
                className: "text-warning",
              }}
            />
          ))}
        </AlertCard>
      )}

      {maintenanceAlerts.length > 0 && (
        <AlertCard icon={MaintenanceIcon} title="Servicio Pendiente" count={maintenanceAlerts.length} tone="maintenance">
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
