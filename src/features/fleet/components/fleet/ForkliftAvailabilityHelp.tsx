import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAvailabilityReasons } from "../../hooks/forklifts/useAvailabilityReasons";
import { AvailabilityReasonsContent } from "./AvailabilityReasonsContent";
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
        <AvailabilityReasonsContent query={query} />
        <p className="text-xs text-muted-foreground">
          Un modelo de catálogo no es una unidad física. No se atribuyen bloqueos al modelo sin evidencia. El alta de equipos sigue reservada al Administrador; esta consulta no cambia estados ni permisos.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
