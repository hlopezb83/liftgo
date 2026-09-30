import { DatePickerField } from "@/components/forms/DatePickerField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toYMD } from "@/lib/date/toYMD";
import { parseDateLocal } from "@/lib/utils";
import type { ReconciliationFilters } from "../../hooks/reconciliation/useReconciliationData";

interface Props {
  filters: ReconciliationFilters;
  invalidRange: boolean;
  onChange: (updater: (f: ReconciliationFilters) => ReconciliationFilters) => void;
}

/**
 * Barra de filtros de la conciliación de facturas. Extraída de la página para
 * mantener el componente contenedor por debajo del límite de complejidad.
 */
export function ReconciliationFilterBar({ filters, invalidRange, onChange }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Filtros</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DatePickerField
          label="Desde"
          date={parseDateLocal(filters.from) ?? undefined}
          onSelect={(date) => onChange((f) => ({ ...f, from: toYMD(date) ?? "" }))}
        />
        <DatePickerField
          label="Hasta"
          date={parseDateLocal(filters.to) ?? undefined}
          onSelect={(date) => onChange((f) => ({ ...f, to: toYMD(date) ?? "" }))}
          error={invalidRange ? "La fecha “Desde” no puede ser posterior a “Hasta”." : undefined}
        />
        <div className="space-y-1">
          <Label htmlFor="reconciliation-fiscal-state">Estado fiscal</Label>
          <Select
            value={filters.fiscalState}
            onValueChange={(v) =>
              onChange((f) => ({ ...f, fiscalState: v as ReconciliationFilters["fiscalState"] }))
            }
          >
            <SelectTrigger id="reconciliation-fiscal-state"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="stamped">Timbradas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
              <SelectItem value="draft">Borradores</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="reconciliation-env">Ambiente PAC</Label>
          <Select
            value={filters.env}
            onValueChange={(v) => onChange((f) => ({ ...f, env: v as ReconciliationFilters["env"] }))}
          >
            <SelectTrigger id="reconciliation-env"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="live">Producción</SelectItem>
              <SelectItem value="test">Sandbox</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
