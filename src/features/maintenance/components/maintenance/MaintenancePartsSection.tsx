import { useState } from "react";
import { InventoryIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  usePartsInventory,
  useMaintenanceParts,
  useAddMaintenancePart,
  type PartInventory,
} from "@/features/inventory";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { AddMaintenancePartForm } from "./AddMaintenancePartForm";

interface Props {
  maintenanceLogId: string;
  currentCost: number;
  /** R12-M10: cuando el OT está `completed`, la UI oculta el formulario de
   * captura. La defensa dura vive en los triggers de DB. */
  readOnly?: boolean;
}

export function MaintenancePartsSection({ maintenanceLogId, currentCost, readOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<PartInventory | null>(null);
  const [quantity, setQuantity] = useState(1);

  const { data: parts = [], isLoading: loadingParts } = usePartsInventory();
  const { data: usedParts = [], isLoading: loadingUsed } = useMaintenanceParts(maintenanceLogId);
  const addPart = useAddMaintenancePart();

  const availableParts = parts.filter((p) => p.stock_quantity > 0);

  const handleAddPart = () => {
    if (!selectedPart) { notifyValidation({ message: "Selecciona una refacción" }); return; }
    if (quantity < 1) { notifyValidation({ message: "La cantidad debe ser al menos 1" }); return; }
    if (quantity > selectedPart.stock_quantity) {
      notifyValidation({ message: `Solo hay ${selectedPart.stock_quantity} en stock` });
      return;
    }

    addPart.mutate(
      {
        maintenance_log_id: maintenanceLogId,
        part_id: selectedPart.id,
        quantity_used: quantity,
        cost_at_time: selectedPart.unit_cost,
        currentLogCost: currentCost,
      },
      {
        onSuccess: () => {
          notifySuccess("Refacción agregada");
          setSelectedPart(null);
          setQuantity(1);
        },
      }
    );
  };

  const partsCost = usedParts.reduce((sum, p) => sum + p.quantity_used * p.cost_at_time, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <InventoryIcon className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Refacciones Utilizadas</h4>
        {partsCost > 0 && (
          <Badge variant="secondary" className="ml-auto">{formatCurrency(partsCost)}</Badge>
        )}
      </div>

      {!readOnly && (
        <AddMaintenancePartForm
          open={open} setOpen={setOpen}
          availableParts={availableParts}
          selectedPart={selectedPart} setSelectedPart={setSelectedPart}
          quantity={quantity} setQuantity={setQuantity}
          loadingParts={loadingParts}
          onAdd={handleAddPart}
          isAdding={addPart.isPending}
        />
      )}

      {loadingUsed ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : usedParts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No se han agregado refacciones.</p>
      ) : (
        <div className="border rounded-md divide-y">
          {usedParts.map((mp) => {
            const partInfo = mp.parts_inventory as { name: string; sku: string | null; category: string } | null;
            return (
              <div key={mp.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{partInfo?.name || "Refacción"}</span>
                  {partInfo?.sku && <span className="text-xs text-muted-foreground">({partInfo.sku})</span>}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>×{mp.quantity_used}</span>
                  <span className="font-mono">{formatCurrency(mp.quantity_used * mp.cost_at_time)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
