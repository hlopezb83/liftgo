import { MaintenanceIcon, PaymentIcon, ClipboardList, OverdueIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { AlertCard, AlertRow } from "./AlertCard";

interface OverdueInvoice {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  total: number;
  /** Saldo pendiente convertido a MXN (v_invoices_with_balance). */
  balance_mxn?: number | null;
  /** Saldo pendiente en la moneda del documento (fallback). */
  balance?: number | null;
  due_date: string | null;
  booking_id?: string | null;
}

/**
 * QA-DASH-02: la alerta debe mostrar el SALDO pendiente en MXN, no el total
 * original de la factura. `balance_mxn` viene de la vista; se mantiene un
 * fallback a `balance` y luego a `total` para fixtures/datos legacy.
 */
function pendingAmountMxn(inv: OverdueInvoice): number {
  if (inv.balance_mxn != null) return Number(inv.balance_mxn);
  if (inv.balance != null) return Number(inv.balance);
  return Number(inv.total);
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
  /** Entregas programadas con fecha ya pasada que nadie cerró. */
  pendingDeliveriesCount?: number;
}

export function AlertsRow({ overdueInvoices, maintenanceAlerts, agingBuckets, overdueBookings, pendingDeliveriesCount = 0 }: AlertsRowProps) {
  const navigate = useNavigateTransition();

  if (
    overdueInvoices.length === 0 &&
    maintenanceAlerts.length === 0 &&
    overdueBookings.length === 0 &&
    pendingDeliveriesCount === 0
  ) return null;

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
              {agingBuckets.length > 0 && (() => {
                const total = agingBuckets.reduce((s, b) => s + b.total, 0);
                const palette = ["bg-warning/60", "bg-warning", "bg-destructive/70", "bg-destructive"];
                return (
                  <div className="space-y-1.5">
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Distribución de aging">
                      {agingBuckets.map((b, i) => {
                        const pct = total > 0 ? (b.total / total) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <button
                            key={b.range}
                            type="button"
                            onClick={() => navigate(`/invoices?status=overdue&aging=${b.range}`)}
                            // BL-R8-17: segmento visual de 8px; pseudo-elemento
                            // expande el área táctil a 44px de alto sin cambiar
                            // la geometría de la barra.
                            className={`${palette[i] ?? "bg-destructive"} relative transition-opacity hover:opacity-80 before:absolute before:-inset-y-[18px] before:inset-x-0 before:content-['']`}
                            style={{ width: `${pct}%` }}
                            title={`${b.range}d: ${formatCurrency(b.total)}`}
                            aria-label={`Aging ${b.range} días: ${formatCurrency(b.total)}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs">
                      {agingBuckets.map((b, i) => (
                        <div key={b.range} className="flex items-center gap-1">
                          <span className={`inline-block h-2 w-2 rounded-sm ${palette[i] ?? "bg-destructive"}`} />
                          <span className="text-muted-foreground">{b.range}d:</span>
                          <span className="tabular-nums font-medium">{formatCurrency(b.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {overdueInvoices.length > 3 && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => navigate("/invoices?status=overdue")}
                  className="h-auto p-0 text-xs text-destructive font-medium"
                >
                  Ver las {overdueInvoices.length} facturas vencidas →
                </Button>
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
              rightTop={<span className="tabular-nums font-semibold text-destructive text-sm sm:text-base whitespace-nowrap">{formatCurrency(pendingAmountMxn(inv))}</span>}
              rightBottom={`Vence: ${formatDateMty(inv.due_date)}`}
              action={{
                icon: PaymentIcon,
                title: "Registrar pago",
                onClick: (e) => {
                  e.stopPropagation();
                  navigate(`/invoices/${inv.id}`);
                },
                className: "text-status-available",
              }}
            />
          ))}
        </AlertCard>
      )}


      {overdueBookings.length > 0 && (
        <AlertCard
          icon={OverdueIcon}
          title="Rentas Vencidas"
          count={overdueBookings.length}
          tone="warning"
          footer={
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => navigate("/returns/pending")}
              className="w-full h-auto p-0 pt-1 text-xs font-medium text-warning"
            >
              Ver todos los retornos pendientes →
            </Button>
          }
        >
          {overdueBookings.slice(0, 5).map((ob) => (
            <AlertRow
              key={ob.booking_id}
              primary={ob.forklift_name}
              secondary={ob.customer_name}
              onClick={() => navigate(`/returns?booking_id=${ob.booking_id}`)}
              rightTop={<span className="tabular-nums font-semibold text-warning whitespace-nowrap">{ob.days_overdue} días</span>}
              rightBottom={`Venció: ${formatDateMty(ob.end_date)}`}
              action={{
                icon: ClipboardList,
                title: "Registrar devolución",
                onClick: (e) => { e.stopPropagation(); navigate(`/returns?booking_id=${ob.booking_id}`); },
                className: "text-warning",
              }}
            />
          ))}
        </AlertCard>
      )}

      <PendingDeliveriesCard count={pendingDeliveriesCount} />

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
                title: "Registrar servicio",
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

/**
 * Bug tablero 2026-09-10: cerrar la entrega es el único evento que pasa la
 * unidad a "rentada". Con entregas programadas vencidas sin cerrar, el
 * catálogo seguía ofreciendo equipo que ya estaba en campo.
 */
function PendingDeliveriesCard({ count }: { count: number }) {
  const navigate = useNavigateTransition();
  if (count === 0) return null;
  return (
    <AlertCard icon={ClipboardList} title="Entregas pendientes de cerrar" count={count} tone="warning"
      footer={
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => navigate("/deliveries?status=scheduled")}
          className="w-full h-auto p-0 pt-1 text-xs font-medium text-warning"
        >
          Ver entregas por cerrar →
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        Su fecha programada ya pasó. Mientras no se cierren, esas unidades siguen
        apareciendo como disponibles en el catálogo.
      </p>
    </AlertCard>
  );
}
