import { useId } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { SuccessIcon, ChevronsUpDown, WarnIcon, AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PartInventory } from "@/features/inventory";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";

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
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  error: boolean;
  retrying: boolean;
  onRetry: () => void;
  canAdd: boolean;
  historicalUnitCost?: number;
}

export function AddMaintenancePartForm({
  open, setOpen, availableParts, selectedPart, setSelectedPart,
  quantity, setQuantity, loadingParts, onAdd, isAdding,
  search, onSearchChange, page, pageSize, totalCount, onPageChange, error, retrying, onRetry, canAdd, historicalUnitCost,
}: Props) {
  const pickerId = useId();
  const quantityId = useId();
  return (
    <div className="space-y-2">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor={pickerId} className="text-xs">Refacción</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button id={pickerId} variant="outline" role="combobox" aria-expanded={open} className="w-full min-w-0 justify-between" disabled={isAdding}>
              {selectedPart ? (
                <span className="truncate">
                  {selectedPart.name}
                  {selectedPart.sku && <span className="text-muted-foreground ml-1">({selectedPart.sku})</span>}
                </span>
              ) : "Buscar refacción…"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Buscar por nombre o SKU…" value={search} onValueChange={onSearchChange} maxLength={256} />
              <CommandList>
                {error ? <QueryErrorState bare entity="las refacciones disponibles" isRetrying={retrying} onRetry={onRetry} />
                  : loadingParts ? <p className="p-4 text-sm" role="status">Cargando refacciones…</p> : <>
                <CommandEmpty>No se encontraron refacciones con existencias.</CommandEmpty>
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
                </>}
              </CommandList>
            </Command>
            <PartPagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={onPageChange} blocked={loadingParts || error} />
          </PopoverContent>
        </Popover>
      </div>

      <div className="w-20 space-y-1">
        <Label htmlFor={quantityId} className="text-xs">Cantidad</Label>
        <Input
          id={quantityId}
          disabled={isAdding}
          type="number"
          min={1}
          // Sin refacción seleccionada (o stock 0) el tope es 0: el hint HTML
          // nunca permite exceder el stock real (la validación vive en handleAddPart).
          max={selectedPart?.stock_quantity ?? 0}
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
        />
      </div>

      <Button size="sm" onClick={onAdd} disabled={!selectedPart || !canAdd || isAdding}>
        <AddIcon className="h-4 w-4 mr-1" />
        Agregar
      </Button>
    </div>
    {historicalUnitCost !== undefined && <p className="text-xs text-muted-foreground">Esta OT conserva el costo registrado de {formatCurrency(historicalUnitCost)} por unidad.</p>}
    </div>
  );
}

function PartPagination({ page, pageSize, totalCount, onPageChange, blocked }: Pick<Props, "page" | "pageSize" | "totalCount" | "onPageChange"> & { blocked: boolean }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return <div className="flex items-center justify-between gap-2 border-t p-2" aria-label="Paginación de refacciones">
    <Button type="button" variant="outline" size="sm" disabled={blocked || page === 0} onClick={() => onPageChange(page - 1)}>Anterior</Button>
    <span className="text-xs" aria-live="polite">{blocked ? "—" : `${page + 1} de ${totalPages}`}</span>
    <Button type="button" variant="outline" size="sm" disabled={blocked || page + 1 >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</Button>
  </div>;
}
