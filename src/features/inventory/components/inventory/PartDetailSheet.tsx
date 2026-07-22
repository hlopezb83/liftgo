import { format } from "date-fns";
import { Activity, useState } from "react";
import { DetailRow } from "@/components/domain/DetailRow";
import { EditIcon, DeleteIcon, InventoryIcon, Hash, Tag, Layers, WarnIcon, CostIcon, LocationIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RoleGuard } from "@/layouts/RoleGuard";
import { APP_LOCALE } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { useDeletePart, type PartInventory } from "../../hooks/usePartsInventory";

interface Props {
  part: PartInventory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (part: PartInventory) => void;
}

export function PartDetailSheet({ part, open, onOpenChange, onEdit }: Props) {
  const deletePart = useDeletePart();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!part) return null;

  const isLow = part.stock_quantity <= part.min_stock_level;

  const handleDelete = () => {
    deletePart.mutate(part.id, {
      onSuccess: () => onOpenChange(false),
    });
  };




  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <InventoryIcon className="h-5 w-5" />
            {part.name}
          </SheetTitle>
        </SheetHeader>

        <Activity mode={open ? "visible" : "hidden"}>
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{part.category}</Badge>
            {isLow && (
              <Badge variant="destructive" className="gap-1">
                <WarnIcon className="h-3 w-3" /> Stock bajo
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <DetailRow icon={Hash} label="SKU" value={<span className="font-mono">{part.sku}</span>} />
            <DetailRow icon={Tag} label="Categoría" value={part.category} />
            <DetailRow icon={CostIcon} label="Costo Unitario" value={formatCurrency(part.unit_cost)} />
          </div>

          <Separator />

          <div className="space-y-1">
            <DetailRow
              icon={Layers}
              label="Stock Actual"
              value={
                <Badge variant={isLow ? "destructive" : "secondary"}>
                  {part.stock_quantity} unidades
                </Badge>
              }
            />
            <DetailRow icon={WarnIcon} label="Stock Mínimo" value={`${part.min_stock_level} unidades`} />
          </div>

          {part.location && (
            <>
              <Separator />
              <DetailRow icon={LocationIcon} label="Ubicación" value={part.location} />
            </>
          )}

          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Creado: {format(new Date(part.created_at), "dd MMM yyyy, HH:mm", { locale: APP_LOCALE })}</p>
            <p>Actualizado: {format(new Date(part.updated_at), "dd MMM yyyy, HH:mm", { locale: APP_LOCALE })}</p>
          </div>

          <Separator />
          <RoleGuard module="Refacciones" minAccess="full" fallback={null}>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { onEdit(part); onOpenChange(false); }}>
                <EditIcon className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => setConfirmOpen(true)}>
                <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
              </Button>
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="¿Eliminar refacción?"
                description={`Esta acción no se puede deshacer. Se eliminará permanentemente "${part.name}" del inventario.`}
                confirmLabel="Eliminar"
                destructive
                loading={deletePart.isPending}
                onConfirm={handleDelete}
              />
            </div>
          </RoleGuard>
        </div>
        </Activity>
      </SheetContent>
    </Sheet>
  );
}
