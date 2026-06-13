import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RoleGuard } from "@/layouts/RoleGuard";
import { useDeletePart, type PartInventory } from "../../hooks/usePartsInventory";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, Package, Hash, Tag, Layers, AlertTriangle, DollarSign } from "lucide-react";

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

  const DetailRow = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {part.name}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{part.category}</Badge>
            {isLow && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Stock bajo
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <DetailRow icon={Hash} label="SKU" value={<span className="font-mono">{part.sku}</span>} />
            <DetailRow icon={Tag} label="Categoría" value={part.category} />
            <DetailRow icon={DollarSign} label="Costo Unitario" value={formatCurrency(part.unit_cost)} />
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
            <DetailRow icon={AlertTriangle} label="Stock Mínimo" value={`${part.min_stock_level} unidades`} />
          </div>

          {part.location && (
            <>
              <Separator />
              <DetailRow icon={Package} label="Ubicación" value={part.location} />
            </>
          )}

          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Creado: {format(new Date(part.created_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>
            <p>Actualizado: {format(new Date(part.updated_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>
          </div>

          <Separator />
          <RoleGuard module="Refacciones" minAccess="full">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { onEdit(part); onOpenChange(false); }}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar refacción?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminará permanentemente "{part.name}" del inventario.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deletePart.isPending}>
                      {deletePart.isPending ? "Eliminando..." : "Eliminar"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </RoleGuard>
        </div>
      </SheetContent>
    </Sheet>
  );
}
