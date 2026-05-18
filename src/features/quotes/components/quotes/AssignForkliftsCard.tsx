import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageCheck } from "lucide-react";
import { useForklifts } from "@/features/fleet/hooks/forklifts/useForklifts";
import {
  useQuoteAssignments,
  useAssignForklift,
  useUnassignForklift,
} from "@/features/fleet/hooks/forklifts/useAssignForklifts";
import type { LineItem } from "@/lib/domain/invoiceUtils";
import { AssignForkliftsLineRow } from "./AssignForkliftsLineRow";

interface Props {
  quoteId: string;
  lineItems: LineItem[];
}

/**
 * Parse "MANUFACTURER MODEL - Venta de equipo" description
 * to extract manufacturer and model for filtering forklifts.
 */
function parseDescription(desc: string): { manufacturer: string; model: string } | null {
  const clean = desc.replace(/\s*-\s*Venta de equipo$/i, "").trim();
  if (!clean) return null;
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

  const [selections, setSelections] = useState<Record<number, string>>({});

  const assignedForkliftIds = useMemo(
    () => new Set((assignments || []).map((a) => a.forklift_id)),
    [assignments]
  );

  if (isLoading) return null;

  const selectedElsewhere = new Set(Object.values(selections));

  const linesData = lineItems.map((item, index) => {
    const parsed = parseDescription(item.description);
    const quantity = item.quantity || 1;
    const available = (allForklifts || []).filter((f) => {
      if (f.status !== "available") return false;
      if (assignedForkliftIds.has(f.id)) return false;
      if (!parsed) return false;
      const mfgMatch = !parsed.manufacturer || (f.manufacturer || "").toLowerCase() === parsed.manufacturer.toLowerCase();
      const modelMatch = (f.model || "").toLowerCase() === parsed.model.toLowerCase();
      return mfgMatch && modelMatch;
    });
    const assigned = (assignments || []).filter((a) => a.line_index === index);
    const assignedForklifts = assigned
      .map((a) => {
        const fl = (allForklifts || []).find((f) => f.id === a.forklift_id);
        return fl ? { ...a, forklift: fl } : null;
      })
      .filter(Boolean) as Array<{ id: string; forklift_id: string; forklift: { name: string; serial_number: string | null } }>;
    return { item, index, quantity, available, assignedForklifts, assignedCount: assigned.length };
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
          <AssignForkliftsLineRow
            key={index}
            description={item.description}
            quantity={quantity}
            assignedCount={assignedCount}
            assignedForklifts={assignedForklifts}
            available={available}
            selectedValue={selections[index] || ""}
            selectedElsewhere={selectedElsewhere}
            isAssigning={assignMutation.isPending}
            isUnassigning={unassignMutation.isPending}
            onSelect={(v) => setSelections((s) => ({ ...s, [index]: v }))}
            onAssign={() => handleAssign(index)}
            onUnassign={(assignmentId, forkliftId) =>
              unassignMutation.mutate({ assignmentId, forkliftId })
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}
