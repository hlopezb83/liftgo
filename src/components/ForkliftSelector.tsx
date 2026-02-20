import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";

interface ForkliftSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  availableForklifts: Tables<"forklifts">[];
  datesSelected: boolean;
  showStatus?: boolean;
}

export function ForkliftSelector({ value, onValueChange, availableForklifts, datesSelected, showStatus }: ForkliftSelectorProps) {
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
              {f.name} — {f.model}{showStatus ? ` (${f.status})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {datesSelected && availableForklifts.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay montacargas disponibles para las fechas seleccionadas.</p>
      )}
    </div>
  );
}