import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/components/RoleGuard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle, Trash2 } from "lucide-react";

interface DeliveryActionsProps {
  status: string;
  onComplete: () => void;
  onDelete: () => void;
}

export function DeliveryActions({ status, onComplete, onDelete }: DeliveryActionsProps) {
  return (
    <div className="flex gap-2">
      {status !== "completed" && (
        <Button size="sm" onClick={onComplete}>
          <CheckCircle className="h-4 w-4 mr-1" /> Completar
        </Button>
      )}
      <RoleGuard module="Entregas" minAccess="full">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar esta entrega?</AlertDialogTitle>
              <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onDelete}>Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </RoleGuard>
    </div>
  );
}
