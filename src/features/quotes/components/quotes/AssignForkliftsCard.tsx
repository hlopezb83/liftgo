import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, Unlink, AlertTriangle } from "lucide-react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import {
  useQuoteAssignments,
  useAssignForklift,
  useUnassignForklift,
} from "@/features/fleet/hooks/forklifts/useAssignForklifts";
import type { LineItem } from "@/lib/domain/invoiceUtils";

interface Props {
  quoteId: string;
  lineItems: LineItem[];
}

/**
 * Parse "MANUFACTURER MODEL - Venta de equipo" description
 * to extract manufacturer and model for filtering forklifts.
 */
function parseDescription(desc: string): { manufacturer: string; model: string } | null {
  // Remove trailing " - Venta de equipo" or similar suffix
  const clean = desc.replace(/\s*-\s*Venta de equipo$/i, "").trim();
  if (!clean) return null;
  // Last token is model, everything before is manufacturer
  const parts = clean.split(/\s+/);
  if (parts.length < 2) return { manufacturer: "", model: clean };
  const model = parts[parts.length - 1];
  const manufacturer = parts.slice(0, -1).join(" ");
  return { manufacturer, model };
}

export function AssignForkliftsCard({ quoteId, lineItems }: Props) {
  const { data: allForklifts } = useForklifts();
  const { data: assignments, isLoading } = useQuoteAssignments(quoteId);
  const assignMutation = useAssignForklift();
  const unassignMutation = useUnassignForklift();

  // Track per-line selections: lineIndex -> forkliftId
  const [selections, setSelections] = useState<Record<number, string>>({});

  const assignedForkliftIds = useMemo(
    () => new Set((assignments || []).map((a) => a.forklift_id)),
    [assignments]
  );

  if (isLoading) return null;

  // Build per-line data
  const linesData = lineItems.map((item, index) => {
    const parsed = parseDescription(item.description);
    const quantity = item.quantity || 1;

    // Available forklifts matching this model
    const available = (allForklifts || []).filter((f) => {
      if (f.status !== "available") return false;
      if (assignedForkliftIds.has(f.id)) return false;
      if (!parsed) return false;
      const mfgMatch = !parsed.manufacturer || (f.manufacturer || "").toLowerCase() === parsed.manufacturer.toLowerCase();
      const modelMatch = (f.model || "").toLowerCase() === parsed.model.toLowerCase();
      return mfgMatch && modelMatch;
    });

    // Already assigned to this line
    const assigned = (assignments || []).filter((a) => a.line_index === index);
    const assignedForklifts = assigned
      .map((a) => {
        const fl = (allForklifts || []).find((f) => f.id === a.forklift_id);
        return fl ? { ...a, forklift: fl } : null;
      })
      .filter(Boolean) as Array<{ id: string; forklift_id: string; forklift: { name: string; serial_number: string | null } }>;

    return { item, index, parsed, quantity, available, assignedForklifts, assignedCount: assigned.length };
  });

  const handleAssign = (lineIndex: number) => {
    const forkliftId = selections[lineIndex];
    if (!forkliftId) return;
    assignMutation.mutate(
      [{ quoteId, forkliftId, lineIndex }],
      {
        onSuccess: () => setSelections((s) => {
          const copy = { ...s };
          delete copy[lineIndex];
          return copy;
        }),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PackageCheck className="h-5 w-5" />
          Asignar Equipos del Inventario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {linesData.map(({ item, index, quantity, available, assignedForklifts, assignedCount }) => (
          <div key={index} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{item.description}</p>
              <Badge variant={assignedCount >= quantity ? "default" : "secondary"}>
                {assignedCount}/{quantity} asignados
              </Badge>
            </div>

            {/* Already assigned */}
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
                  onClick={() => unassignMutation.mutate({ assignmentId: af.id, forkliftId: af.forklift_id })}
                  disabled={unassignMutation.isPending}
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Desasignar
                </Button>
              </div>
            ))}

            {/* Selector for new assignment */}
            {assignedCount < quantity && (
              <div className="flex gap-2">
                <Select
                  value={selections[index] || ""}
                  onValueChange={(v) => setSelections((s) => ({ ...s, [index]: v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar equipo disponible" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">Sin equipos disponibles</div>
                    ) : (
                      available
                        .filter((f) => !Object.values(selections).includes(f.id))
                        .map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} {f.serial_number ? `— S/N: ${f.serial_number}` : ""}
                          </SelectItem>
                        ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!selections[index] || assignMutation.isPending}
                  onClick={() => handleAssign(index)}
                >
                  Asignar
                </Button>
              </div>
            )}

            {assignedCount < quantity && available.length === 0 && assignedCount === 0 && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                No hay equipos disponibles de este modelo en inventario
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
