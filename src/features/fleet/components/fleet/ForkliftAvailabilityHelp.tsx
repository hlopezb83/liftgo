import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { STATUS_LABELS } from "@/lib/constants";
import { useAvailabilityReasons } from "../../hooks/forklifts/useAvailabilityReasons";
import type { DateRange } from "react-day-picker";

export function ForkliftAvailabilityHelp({ dateRange }: { dateRange: DateRange | undefined }) {
  const [open, setOpen] = useState(false);
  const query = useAvailabilityReasons(dateRange, open);
  if (!dateRange?.from || !dateRange.to || dateRange.to < dateRange.from || !query.allowed) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border p-3 text-sm">
      <CollapsibleTrigger className="w-full text-left font-medium underline underline-offset-4">
        ¿Por qué no aparecen otros equipos?
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">
        <p className="text-xs text-muted-foreground">
          Un hueco en el calendario no confirma que el equipo esté libre físicamente. La disponibilidad para reservar y el estado operativo son distintos.
        </p>
        {query.isFetching || query.isPending ? (
          <p role="status">Verificando disponibilidad y motivos…</p>
        ) : query.isError ? (
          <p role="alert">No se pudieron verificar los motivos. No se puede concluir que no haya equipos disponibles.</p>
        ) : query.data && (
          <>
            {query.data.evidenceIncomplete && <p role="status" className="text-xs text-muted-foreground">Algunos detalles no se pudieron verificar con tu acceso actual. Sólo se muestran causas comprobadas; los demás motivos quedan sin confirmar.</p>}
            {query.data.unavailable.length === 0 && <p>No se encontraron unidades excluidas de las fechas seleccionadas en la flota consultada.</p>}
            <ul className="space-y-3">
              {query.data.unavailable.map(({ unit, reason }) => (
                <li key={unit.id} className="space-y-1 rounded border p-3">
                  <p className="font-medium">{unit.name} · {unit.model || "Modelo sin registrar"}</p>
                  <p className="text-xs text-muted-foreground">Estado operativo: {STATUS_LABELS[unit.status] ?? "Sin confirmar"}</p>
                  <p className="font-medium">{reason.label}</p>
                  <p>{reason.detail}</p>
                  <p className="text-xs text-muted-foreground">Siguiente paso: {reason.nextAction}</p>
                </li>
              ))}
            </ul>
            {query.data.reservableWhileRented.length > 0 && (
              <div className="space-y-1 rounded border p-3">
                <p className="font-medium">Reservables para estas fechas, aún con estado Rentado</p>
                <p>{query.data.reservableWhileRented.map((unit) => unit.name).join(", ")}</p>
                <p className="text-xs text-muted-foreground">El servidor permite reservar este periodo. Esto no acredita una devolución ni autoriza la entrega; Operaciones debe verificar la custodia antes de entregar.</p>
              </div>
            )}
          </>
        )}
        <Button type="button" variant="outline" size="sm" disabled={query.isFetching} onClick={() => { void query.refresh(); }}>
          Actualizar motivos
        </Button>
        <p className="text-xs text-muted-foreground">
          Un modelo de catálogo no es una unidad física. No se atribuyen bloqueos al modelo sin evidencia. El alta de equipos sigue reservada al Administrador; esta consulta no cambia estados ni permisos.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
