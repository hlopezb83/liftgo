import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/layouts/RoleGuard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SuccessIcon, DeleteIcon } from "@/components/icons";

interface DeliveryActionsProps {
  status: string;
  onComplete: () => void;
  onDelete: () => void;
}

export function DeliveryActions({ status, onComplete, onDelete }: DeliveryActionsProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-2">
      {status !== "completed" && (
        <Button size="sm" onClick={onComplete}>
          <SuccessIcon className="h-4 w-4 mr-1" /> Completar
        </Button>
      )}
      <RoleGuard module="Entregas" minAccess="full">
        <Button variant="outline" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
          <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="¿Eliminar esta entrega?"
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          destructive
          onConfirm={onDelete}
        />
      </RoleGuard>
    </div>
  );
}
