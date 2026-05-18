import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface ForkliftSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  availableForklifts: Tables<"forklifts">[];
  datesSelected: boolean;
  showStatus?: boolean;
  error?: string;
}

/** Single-select version (legacy, used by BookingForm etc.) */
export function ForkliftSelector({ value, onValueChange, availableForklifts, datesSelected, showStatus, error }: ForkliftSelectorProps) {
  return (
    <div className="space-y-1.5">
      <Label>Montacargas *</Label>
      <Select value={value} onValueChange={onValueChange} disabled={!datesSelected}>
        <SelectTrigger>
          <SelectValue placeholder={datesSelected ? "Seleccionar montacargas" : "Primero selecciona fechas"} />
        </SelectTrigger>
        <SelectContent>
          {availableForklifts.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.manufacturer} {f.model} — {f.name}{showStatus ? ` (${f.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {datesSelected && availableForklifts.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay montacargas disponibles para las fechas seleccionadas.</p>
      )}
    </div>
  );
}

