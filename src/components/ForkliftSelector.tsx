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
}

/** Single-select version (legacy, used by BookingForm etc.) */
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
              {f.manufacturer} {f.model} — {f.name}{showStatus ? ` (${f.status})` : ""}
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

/* ─── Multi-select version ─── */

interface MultiForkliftSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  availableForklifts: Tables<"forklifts">[];
  allForklifts: Tables<"forklifts">[] | undefined;
  datesSelected: boolean;
}

export function MultiForkliftSelector({ selectedIds, onChange, availableForklifts, allForklifts, datesSelected }: MultiForkliftSelectorProps) {
  const remaining = availableForklifts.filter((f) => !selectedIds.includes(f.id));

  const addForklift = (id: string) => {
    if (id && !selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
  };

  const removeForklift = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  const getForkliftLabel = (id: string) => {
    const f = allForklifts?.find((fl) => fl.id === id);
    return f ? `${f.manufacturer} ${f.model} — ${f.name}` : id;
  };

  return (
    <div className="space-y-3">
      <Label>Montacargas *</Label>

      {/* Selected list */}
      {selectedIds.map((id) => (
        <div key={id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
          <span className="flex-1 text-sm">{getForkliftLabel(id)}</span>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeForklift(id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}

      {/* Add selector */}
      {datesSelected && remaining.length > 0 && (
        <Select value="" onValueChange={addForklift}>
          <SelectTrigger>
            <SelectValue placeholder="Agregar montacargas…" />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.manufacturer} {f.model} — {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {!datesSelected && (
        <p className="text-xs text-muted-foreground">Primero selecciona las fechas de renta.</p>
      )}

      {datesSelected && remaining.length === 0 && selectedIds.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay montacargas disponibles para las fechas seleccionadas.</p>
      )}

      {datesSelected && selectedIds.length > 0 && remaining.length > 0 && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => {}}>
          <Plus className="h-4 w-4 mr-1" /> Selecciona otro equipo del dropdown de arriba
        </Button>
      )}
    </div>
  );
}
