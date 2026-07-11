import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Unlink } from "@/components/icons";

interface AssignedForklift {
  id: string;
  forklift_id: string;
  forklift: { name: string; serial_number: string | null };
}

interface AvailableForklift {
  id: string;
  name: string;
  serial_number: string | null;
}

interface Props {
  description: string;
  quantity: number;
  assignedCount: number;
  assignedForklifts: AssignedForklift[];
  available: AvailableForklift[];
  selectedValue: string;
  selectedElsewhere: Set<string>;
  isAssigning: boolean;
  isUnassigning: boolean;
  onSelect: (forkliftId: string) => void;
  onAssign: () => void;
  onUnassign: (assignmentId: string, forkliftId: string) => void;
}

export function AssignForkliftsLineRow({
  description, quantity, assignedCount, assignedForklifts, available,
  selectedValue, selectedElsewhere, isAssigning, isUnassigning,
  onSelect, onAssign, onUnassign,
}: Props) {
  const needsMore = assignedCount < quantity;
  const noStock = needsMore && available.length === 0 && assignedCount === 0;

  return (
    <div className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{description}</p>
        <Badge variant={assignedCount >= quantity ? "default" : "secondary"}>
          {assignedCount}/{quantity} asignados
        </Badge>
      </div>

      {assignedForklifts.map((af) => (
        <div key={af.id} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 text-sm">
          <span>
            {af.forklift.name}
            {af.forklift.serial_number && (
              <span className="text-muted-foreground ml-1">— S/N: {af.forklift.serial_number}</span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUnassign(af.id, af.forklift_id)}
            disabled={isUnassigning}
          >
            <Unlink className="h-4 w-4 mr-1" />
            Desasignar
          </Button>
        </div>
      ))}

      {needsMore && (
        <div className="flex gap-2">
          <Select value={selectedValue} onValueChange={onSelect}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Seleccionar equipo disponible" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Sin equipos disponibles</div>
              ) : (
                available
                  .filter((f) => f.id === selectedValue || !selectedElsewhere.has(f.id))
                  .map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} {f.serial_number ? `— S/N: ${f.serial_number}` : ""}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!selectedValue || isAssigning} onClick={onAssign}>
            Asignar
          </Button>
        </div>
      )}

      {noStock && (
        <p className="text-xs text-warning flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          No hay equipos disponibles de este modelo en inventario
        </p>
      )}
    </div>
  );
}
