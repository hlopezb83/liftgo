import { SuccessIcon, ChevronsUpDown, WarnIcon, AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { PartInventory } from "@/features/inventory";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  availableParts: PartInventory[];
  selectedPart: PartInventory | null;
  setSelectedPart: (p: PartInventory | null) => void;
  quantity: number;
  setQuantity: (q: number) => void;
  loadingParts: boolean;
  onAdd: () => void;
  isAdding: boolean;
}

export function AddMaintenancePartForm({
  open, setOpen, availableParts, selectedPart, setSelectedPart,
  quantity, setQuantity, loadingParts, onAdd, isAdding,
}: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1">
        <Label className="text-xs">Refacción</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between" disabled={loadingParts}>
              {selectedPart ? (
                <span className="truncate">
                  {selectedPart.name}
                  {selectedPart.sku && <span className="text-muted-foreground ml-1">({selectedPart.sku})</span>}
                </span>
              ) : "Buscar refacción..."}
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
                        onSelect={() => { setSelectedPart(part); setOpen(false); }}
                      >
                        <SuccessIcon className={cn("mr-2 h-4 w-4", selectedPart?.id === part.id ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{part.name}</span>
                            {isLow && <WarnIcon className="h-3 w-3 text-destructive shrink-0" />}
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

      <Button size="sm" onClick={onAdd} disabled={!selectedPart || isAdding}>
        <AddIcon className="h-4 w-4 mr-1" />
        Agregar
      </Button>
    </div>
  );
}
