import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryFormDialog, type DeliveryBookingContext } from "@/features/deliveries";
import { useHasModuleAccess } from "@/features/users";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { Link } from "@/lib/router-compat-ui";
import { bookingNextStep, type BookingNextAction, type BookingTransport } from "../../hooks/bookingDetail/bookingNextStep";
import { useBookingTransportContext } from "../../hooks/bookingDetail/useBookingTransportContext";
import { type BookingWithForklift } from "../../hooks/bookings/useBookings";

interface Props {
  booking: BookingWithForklift;
  deliveries: BookingTransport[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function BookingNextStepCard({ booking, deliveries, isLoading, isError }: Props) {
  const canRead = useHasModuleAccess("Entregas", "read");
  const canWrite = useHasModuleAccess("Entregas", "full");
  const createContext = useBookingTransportContext(booking);
  const regionRef = useRef<HTMLElement>(null);
  // Capture the context only when opening; background refreshes never reset a draft.
  const [context, setContext] = useState<DeliveryBookingContext | null>(null);
  if (!canRead) return null;

  const step = bookingNextStep(booking, { deliveries, isLoading, isError }, todayKeyMty());
  const action = step.action;
  const requiresWrite = action?.kind === "schedule" || action?.kind === "return";

  const openSchedule = (type: "delivery" | "pickup") => {
    if (!canWrite) return;
    setContext(createContext(type));
  };

  return (
    <section ref={regionRef} tabIndex={-1} aria-label="Siguiente paso de la renta" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Siguiente paso</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm">{step.description}</p>
            {requiresWrite && !canWrite && <p className="text-sm text-muted-foreground">Tu rol puede consultar la operación. Despacho puede continuar este paso.</p>}
          </div>
          <NextAction action={action} bookingId={booking.id} canWrite={canWrite} onSchedule={openSchedule} />
        </CardContent>
      </Card>
      {context && <DeliveryFormDialog
        open hideTrigger context={context}
        onOpenChange={(open) => { if (!open) setContext(null); }}
        onCloseAutoFocus={(event) => {
          const target = regionRef.current;
          if (target?.isConnected) { event.preventDefault(); target.focus({ preventScroll: true }); }
        }}
      />}
    </section>
  );
}

function NextAction({ action, bookingId, canWrite, onSchedule }: {
  action: BookingNextAction | undefined; bookingId: string; canWrite: boolean;
  onSchedule: (type: "delivery" | "pickup") => void;
}) {
  if (!action) return null;
  switch (action.kind) {
    case "transport": return <Button asChild className="shrink-0"><Link to={`/deliveries/${action.id}`}>{action.label}</Link></Button>;
    case "review": return <Button asChild variant="outline" className="shrink-0"><a href="#booking-transports">{action.label}</a></Button>;
    case "return": return canWrite && <Button asChild className="shrink-0"><Link to={`/returns?booking_id=${bookingId}${action.early ? "&early=1" : ""}`}>{action.label}</Link></Button>;
    case "schedule": return canWrite && <Button className="shrink-0" onClick={() => onSchedule(action.type)}>{action.label}</Button>;
  }
}
