import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RoleGuard } from "@/components/RoleGuard";
import { useDeleteExpense, EXPENSE_CATEGORY_LABELS, type OperatingExpense } from "@/hooks/useOperatingExpenses";
import { formatCurrency } from "@/lib/formatCurrency";
import { parseDateLocal } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Pencil, Trash2, DollarSign, Calendar, FileText, Tag, Truck, RefreshCw } from "lucide-react";

interface Props {
  expense: OperatingExpense | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: OperatingExpense) => void;
}

export function ExpenseDetailSheet({ expense, open, onOpenChange, onEdit }: Props) {
  const deleteExpense = useDeleteExpense();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!expense) return null;

  const handleDelete = () => {
    deleteExpense.mutate(expense.id, {
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
            <DollarSign className="h-5 w-5" />
            Detalle de Gasto
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant={expense.category === "costo_venta" ? "secondary" : "outline"}>
              {EXPENSE_CATEGORY_LABELS[expense.category]}
            </Badge>
            {expense.is_recurring && (
              <Badge variant="outline" className="gap-1">
                <RefreshCw className="h-3 w-3" /> Recurrente
              </Badge>
            )}
          </div>

          <div className="space-y-1">
            <DetailRow icon={DollarSign} label="Monto" value={formatCurrency(expense.amount)} />
            <DetailRow icon={Calendar} label="Fecha" value={format(parseDateLocal(expense.expense_date), "dd MMMM yyyy", { locale: es })} />
            <DetailRow icon={Tag} label="Categoría" value={EXPENSE_CATEGORY_LABELS[expense.category]} />
            <DetailRow icon={Truck} label="Proveedor" value={expense.suppliers?.name} />
          </div>

          {expense.description && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Descripción</p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{expense.description}</p>
              </div>
            </>
          )}

          <Separator />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Creado: {format(new Date(expense.created_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>
            <p>Actualizado: {format(new Date(expense.updated_at), "dd MMM yyyy, HH:mm", { locale: es })}</p>
          </div>

          <Separator />
          <RoleGuard module="Gastos" minAccess="full">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { onEdit(expense); onOpenChange(false); }}>
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
                    <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Se eliminará permanentemente el gasto de {formatCurrency(expense.amount)} del {format(parseDateLocal(expense.expense_date), "dd MMM yyyy", { locale: es })}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleteExpense.isPending}>
                      {deleteExpense.isPending ? "Eliminando..." : "Eliminar"}
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
