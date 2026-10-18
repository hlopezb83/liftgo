import { AdminCorrectionDialog } from "@/components/domain/AdminCorrectionDialog";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { useCorrectDeliveryDate, useVoidDelivery } from "../../hooks/useDeliveries";

interface Props {
  delivery: { id: string; delivery_number: string; scheduled_date: string };
  correctOpen: boolean;
  setCorrectOpen: (open: boolean) => void;
  voidOpen: boolean;
  setVoidOpen: (open: boolean) => void;
}

/** Diálogos administrativos de corrección/anulación de una entrega completada. */
export function DeliveryAdminCorrections({ delivery, correctOpen, setCorrectOpen, voidOpen, setVoidOpen }: Props) {
  const correctDate = useCorrectDeliveryDate();
  const voidDelivery = useVoidDelivery();
  return (
    <>
      {correctOpen && (
        <AdminCorrectionDialog
          open={correctOpen}
          onOpenChange={setCorrectOpen}
          title={`Corregir fecha de ${delivery.delivery_number}`}
          description="Cambia la fecha real en que se entregó el equipo. La reserva debe estar activa (si ya tiene devolución, anúlala primero)."
          confirmLabel="Guardar fecha"
          dateLabel="Fecha real de entrega"
          initialDate={delivery.scheduled_date}
          maxDate={todayKeyMty()}
          isPending={correctDate.isPending}
          onConfirm={({ reason, date }) => correctDate.mutate(
            { id: delivery.id, date: date ?? "", reason },
            { onSuccess: () => setCorrectOpen(false) },
          )}
        />
      )}
      {voidOpen && (
        <AdminCorrectionDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          destructive
          title={`Anular ${delivery.delivery_number}`}
          description="Úsalo solo si esta entrega nunca ocurrió. Quedará cancelada en el historial y, si el montacargas no tiene otra renta entregada, regresará a disponible."
          confirmLabel="Anular entrega"
          isPending={voidDelivery.isPending}
          onConfirm={({ reason }) => voidDelivery.mutate(
            { id: delivery.id, reason },
            { onSuccess: () => setVoidOpen(false) },
          )}
        />
      )}
    </>
  );
}
