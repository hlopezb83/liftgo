import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";

interface Props {
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onClose: () => void;
  hasRequestedBooking: boolean;
  isEarlyReturn: boolean;
}

export function ReturnBookingAvailability({
  isLoading, isError, isRetrying, onRetry, onClose, hasRequestedBooking, isEarlyReturn,
}: Props) {
  return (
    <div className="space-y-6">
      {isLoading ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Comprobando reservas disponibles…
        </p>
      ) : isError ? (
        <QueryErrorState bare entity="las reservas disponibles" onRetry={onRetry} isRetrying={isRetrying} />
      ) : (
        <div role="status" className="space-y-3 rounded-lg border bg-muted/30 p-5">
          <h3 className="font-medium">
            {hasRequestedBooking ? "Esta reserva no está disponible para devolución" : "No hay reservas listas para devolver"}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            La reserva debe estar confirmada, haber iniciado y tener una entrega completada.
            Las reservas ya devueltas no aparecen en esta lista.
          </p>
          {!isEarlyReturn && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Aquí se muestran rentas cuyo periodo ha terminado. Para devolver un equipo antes,
              abre su reserva y selecciona Devolución Anticipada.
            </p>
          )}
        </div>
      )}
      <div className="flex justify-end border-t pt-4">
        <FormDialogCancelButton onCancel={onClose} label="Cerrar" />
      </div>
    </div>
  );
}
