import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { formatDateDisplay } from "@/lib/utils";
import { hasOverlappingBookings, type ClampedBooking } from "../../../lib/drilldown";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  forkliftName: string | null;
  bookedDays: number;
  totalDays: number;
  utilization: number;
  bookings: ClampedBooking[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-3xs uppercase text-muted-foreground">{label}</p>
      <p className="font-mono font-bold">{value}</p>
    </div>
  );
}

export function UtilizationDetailSheet({
  open, onOpenChange, forkliftName, bookedDays, totalDays, utilization, bookings,
}: Props) {
  const navigate = useNavigateTransition();
  const overlapped = hasOverlappingBookings(bookings);
  const sumDays = bookings.reduce((s, b) => s + b.daysInRange, 0);

  const go = (id: string) => {
    onOpenChange(false);
    navigate(`/bookings/${id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {forkliftName ?? "Montacargas"}{" "}
            <span className="text-muted-foreground font-normal text-sm">— detalle de utilización</span>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Días reservados" value={String(bookedDays)} />
            <Stat label="Días del rango" value={String(totalDays)} />
            <Stat label="Utilización" value={`${utilization}%`} />
          </div>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Reservas en el rango ({bookings.length})</h3>
              <span className="font-mono text-sm font-bold">{sumDays} días</span>
            </div>
            {overlapped && sumDays !== bookedDays && (
              <p className="text-xs text-muted-foreground mb-2">
                Hay reservas traslapadas: los días compartidos se cuentan una sola vez, por eso el total
                del reporte ({bookedDays}) es menor a la suma de esta lista ({sumDays}).
              </p>
            )}
            {bookings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sin reservas en el rango</p>
            ) : (
              <ul className="space-y-1">
                {bookings.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => go(b.id)}
                      className="w-full flex items-center justify-between gap-3 text-left rounded-md border p-2 text-xs hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {b.booking_number} · {b.customer_name || "—"}
                        </p>
                        <p className="text-muted-foreground truncate">
                          {formatDateDisplay(b.clampedStart)} – {formatDateDisplay(b.clampedEnd)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={b.status} />
                        <span className="font-mono font-bold">{b.daysInRange}d</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
