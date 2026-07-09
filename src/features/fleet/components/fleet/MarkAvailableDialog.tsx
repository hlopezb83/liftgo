import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { useUpdateStatus } from "../../hooks/forklifts/useForklifts";
import { notifySuccess } from "@/lib/ui/appFeedback";

interface MarkAvailableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forkliftId: string;
  forkliftName: string;
}

export function MarkAvailableDialog({ open, onOpenChange, forkliftId, forkliftName }: MarkAvailableDialogProps) {
  const updateStatus = useUpdateStatus();

  const handleConfirm = () => {
    updateStatus.mutate(
      { forkliftId, fromStatus: "maintenance", toStatus: "available", note: "Mantenimiento completado" },
      {
        onSuccess: () => {
          notifySuccess(`${forkliftName} marcado como disponible`);
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      width="sm"
      title="¿Marcar como Disponible?"
      description={
        <span className="flex items-start gap-2">
          <CheckCircle className="h-4 w-4 text-status-available mt-0.5 shrink-0" />
          {forkliftName} está actualmente en mantenimiento. ¿Marcarlo como disponible?
        </span>
      }
    >
      <FormDialogFooter className="flex-col gap-2 sm:flex-row">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Todavía No
        </Button>
        <Button onClick={handleConfirm} disabled={updateStatus.isPending}>
          {updateStatus.isPending ? "Actualizando..." : "Marcar Disponible"}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
