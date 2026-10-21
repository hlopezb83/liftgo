import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import { STATUS_LABELS } from "@/lib/constants";

interface ForkliftSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  availableForklifts: Tables<"forklifts">[];
  datesSelected: boolean;
  showStatus?: boolean;
  error?: string;
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => unknown;
}

function AvailabilityStatus({ datesSelected, verifying, isError, empty, onRetry }: {
  datesSelected: boolean;
  verifying: boolean;
  isError: boolean;
  empty: boolean;
  onRetry?: () => unknown;
}) {
  if (!datesSelected) return null;
  if (verifying) return <p className="text-xs text-muted-foreground" role="status">Verificando disponibilidad…</p>;
  if (isError) return (
    <div className="space-y-1">
      <p className="text-xs text-destructive" role="alert">No se pudo consultar la disponibilidad. Inténtalo de nuevo.</p>
      {onRetry && <Button type="button" variant="outline" size="sm" onClick={() => { onRetry(); }}>Reintentar disponibilidad</Button>}
    </div>
  );
  return empty ? <p className="text-xs text-muted-foreground">No hay montacargas disponibles para las fechas seleccionadas.</p> : null;
}

/** Single-select version (legacy, used by BookingForm etc.) */
export function ForkliftSelector({ value, onValueChange, availableForklifts, datesSelected, showStatus, error, isLoading = false, isError = false, isFetching = false, onRetry }: ForkliftSelectorProps) {
  const verifying = isLoading || isFetching;
  return (
    <div className="space-y-1.5">
      <Label>Montacargas *</Label>
      <Select value={value} onValueChange={onValueChange} disabled={!datesSelected || verifying || isError}>
        <SelectTrigger aria-label="Montacargas">
          <SelectValue placeholder={datesSelected ? "Seleccionar montacargas" : "Primero selecciona fechas"} />
        </SelectTrigger>
        <SelectContent>
          {availableForklifts.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.manufacturer} {f.model} — {f.name}{showStatus ? ` (${STATUS_LABELS[f.status] ?? f.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <AvailabilityStatus datesSelected={datesSelected} verifying={verifying} isError={isError} empty={availableForklifts.length === 0} onRetry={onRetry} />
    </div>
  );
}
