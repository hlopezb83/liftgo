import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
      <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label htmlFor="from">Desde</Label>
          <Input
            id="from"
            type="date"
            value={filters.from}
            onChange={(e) => onChange((f) => ({ ...f, from: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">Hasta</Label>
          <Input
            id="to"
            type="date"
            value={filters.to}
            onChange={(e) => onChange((f) => ({ ...f, to: e.target.value }))}
          />
          {invalidRange && (
            <p className="text-xs text-destructive">La fecha “Desde” no puede ser posterior a “Hasta”.</p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Estado fiscal</Label>
          <Select
            value={filters.fiscalState}
            onValueChange={(v) =>
              onChange((f) => ({ ...f, fiscalState: v as ReconciliationFilters["fiscalState"] }))
            }
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="stamped">Timbradas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
              <SelectItem value="draft">Borradores</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Ambiente PAC</Label>
          <Select
            value={filters.env}
            onValueChange={(v) => onChange((f) => ({ ...f, env: v as ReconciliationFilters["env"] }))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
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
