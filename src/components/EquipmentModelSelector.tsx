import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EquipmentModel } from "@/hooks/useEquipmentModels";

interface EquipmentModelSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  models: EquipmentModel[];
}

export function EquipmentModelSelector({ value, onValueChange, models }: EquipmentModelSelectorProps) {
  return (
    <div className="space-y-1.5">
      <Label>Modelo de Equipo *</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Seleccionar modelo" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.manufacturer} — {m.model}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {models.length === 0 && (
        <p className="text-xs text-muted-foreground">No hay modelos de equipo configurados.</p>
      )}
    </div>
  );
}
