import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/constants";
import { Link } from "@/lib/router-compat-ui";
import type { useAvailabilityReasons } from "../../hooks/forklifts/useAvailabilityReasons";
import type { AvailabilityUnit } from "../../lib/availabilityReasons";

type AvailabilityQuery = ReturnType<typeof useAvailabilityReasons>;

function UnitHeading({ unit }: { unit: AvailabilityUnit }) {
  return <>
    <p className="font-medium">{unit.name} · {unit.model || "Modelo sin registrar"}</p>
    <p className="text-xs text-muted-foreground">Estado operativo: {STATUS_LABELS[unit.status] ?? "Sin confirmar"}</p>
  </>;
}

function emptyEvidenceMessage(result: NonNullable<AvailabilityQuery["data"]>, singleUnit: boolean) {
  if (result.unavailable.length > 0) return undefined;
  if (!singleUnit) return "No se encontraron unidades excluidas de las fechas seleccionadas en la flota consultada.";
  if (!result.availableUnits?.length) return "No se encontró el equipo con tu acceso actual. Actualiza la consulta antes de decidir.";
  return undefined;
}

/** One presentation for the selector, calendar and equipment lookup. */
export function AvailabilityReasonsContent({ query, singleUnit = false }: { query: AvailabilityQuery; singleUnit?: boolean }) {
  const result = query.data;
  const emptyMessage = result && emptyEvidenceMessage(result, singleUnit);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Un hueco en el calendario no confirma que el equipo esté libre físicamente. La disponibilidad para reservar y el estado operativo son distintos.
      </p>
      {query.isFetching || query.isPending ? (
        <p role="status">Verificando disponibilidad y motivos…</p>
      ) : query.isError ? (
        <p role="alert">No se pudieron verificar los motivos. No se puede concluir que no haya equipos disponibles.</p>
      ) : result && (
        <>
          {result.evidenceIncomplete && <p role="status" className="text-xs text-muted-foreground">Algunos detalles no se pudieron verificar con tu acceso actual. Sólo se muestran causas comprobadas; los demás motivos quedan sin confirmar.</p>}
          {singleUnit && result.availableUnits?.map((unit) => (
            <section key={unit.id} className="space-y-1 rounded border p-3" aria-label={`Disponibilidad de ${unit.name}`}>
              <UnitHeading unit={unit} />
              <p className="font-medium">Disponible para reservar en las fechas seleccionadas</p>
              <p className="text-xs text-muted-foreground">La reserva se verifica nuevamente al confirmar. Esta consulta no acredita una devolución ni autoriza la entrega.</p>
            </section>
          ))}
          {emptyMessage && <p>{emptyMessage}</p>}
          <ul className="space-y-3">
            {result.unavailable.map(({ unit, reason, bookingId }) => (
              <li key={unit.id} className="space-y-1 rounded border p-3">
                <UnitHeading unit={unit} />
                <p className="font-medium">Disponibilidad para estas fechas: no disponible</p>
                <p className="font-medium">{reason.label}</p>
                <p>{reason.detail}</p>
                <p className="text-xs text-muted-foreground">Siguiente paso: {reason.nextAction}</p>
                {bookingId && <Link className="inline-flex min-h-11 items-center text-primary underline underline-offset-4" to={`/bookings/${bookingId}`}>Ver reserva que explica el bloqueo</Link>}
              </li>
            ))}
          </ul>
          {!singleUnit && result.reservableWhileRented.length > 0 && (
            <div className="space-y-1 rounded border p-3">
              <p className="font-medium">Reservables para estas fechas, aún con estado Rentado</p>
              <p>{result.reservableWhileRented.map((unit) => unit.name).join(", ")}</p>
              <p className="text-xs text-muted-foreground">El servidor permite reservar este periodo. Esto no acredita una devolución ni autoriza la entrega; Operaciones debe verificar la custodia antes de entregar.</p>
            </div>
          )}
        </>
      )}
      <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={() => { void query.refresh(); }}>Actualizar motivos</Button>
    </div>
  );
}
