import { useState } from "react";
import { Check, ChevronsUpDown, Package, Plus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  usePartsInventory,
  useMaintenanceParts,
  useAddMaintenancePart,
  type PartInventory,
} from "@/hooks/usePartsInventory";
import { toast } from "sonner";

interface Props {
  maintenanceLogId: string;
  currentCost: number;
}

export function MaintenancePartsSection({ maintenanceLogId, currentCost }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<PartInventory | null>(null);
  const [quantity, setQuantity] = useState(1);

  const { data: parts = [], isLoading: loadingParts } = usePartsInventory();
  const { data: usedParts = [], isLoading: loadingUsed } = useMaintenanceParts(maintenanceLogId);
  const addPart = useAddMaintenancePart();

  // Filter parts with stock > 0
  const availableParts = parts.filter((p) => p.stock_quantity > 0);

  const handleAddPart = () => {
    if (!selectedPart) {
      toast.error("Selecciona una refacción");
      return;
    }
    if (quantity < 1) {
      toast.error("La cantidad debe ser al menos 1");
      return;
    }
    if (quantity > selectedPart.stock_quantity) {
      toast.error(`Solo hay ${selectedPart.stock_quantity} en stock`);
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
          toast.success("Refacción agregada");
          setSelectedPart(null);
          setQuantity(1);
        },
      }
    );
  };

  const partsCost = usedParts.reduce(
    (sum, p) => sum + p.quantity_used * p.cost_at_time,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h4 className="font-semibold text-sm">Refacciones Utilizadas</h4>
        {partsCost > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {formatCurrency(partsCost)}
          </Badge>
        )}
      </div>

      {/* Add new part */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Refacción</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
                disabled={loadingParts}
              >
                {selectedPart ? (
                  <span className="truncate">
                    {selectedPart.name}
                    {selectedPart.sku && (
                      <span className="text-muted-foreground ml-1">
                        ({selectedPart.sku})
                      </span>
                    )}
                  </span>
                ) : (
                  "Buscar refacción..."
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar por nombre o SKU..." />
                <CommandList>
                  <CommandEmpty>No se encontraron refacciones.</CommandEmpty>
                  <CommandGroup>
                    {availableParts.map((part) => {
                      const isLow = part.stock_quantity <= part.min_stock_level;
                      return (
                        <CommandItem
                          key={part.id}
                          value={`${part.name} ${part.sku || ""}`}
                          onSelect={() => {
                            setSelectedPart(part);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedPart?.id === part.id
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">
                                {part.name}
                              </span>
                              {isLow && (
                                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {part.sku && <span>{part.sku}</span>}
                              <span>Stock: {part.stock_quantity}</span>
                              <span>{formatCurrency(part.unit_cost)}</span>
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="w-20 space-y-1">
          <Label className="text-xs">Cantidad</Label>
          <Input
            type="number"
            min={1}
            max={selectedPart?.stock_quantity || 999}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          />
        </div>

        <Button
          size="sm"
          onClick={handleAddPart}
          disabled={!selectedPart || addPart.isPending}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar
        </Button>
      </div>

      {/* List of used parts */}
      {loadingUsed ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : usedParts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No se han agregado refacciones.
        </p>
      ) : (
        <div className="border rounded-md divide-y">
          {usedParts.map((mp) => {
            const partInfo = mp.parts_inventory as {
              name: string;
              sku: string | null;
              category: string;
            } | null;
            return (
              <div
                key={mp.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">
                    {partInfo?.name || "Refacción"}
                  </span>
                  {partInfo?.sku && (
                    <span className="text-xs text-muted-foreground">
                      ({partInfo.sku})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>×{mp.quantity_used}</span>
                  <span className="font-mono">
                    {formatCurrency(mp.quantity_used * mp.cost_at_time)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
