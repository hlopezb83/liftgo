import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateStatus } from "@/hooks/useForklifts";
import { CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface MarkAvailableDialogProps { open: boolean; onOpenChange: (open: boolean) => void; forkliftId: string; forkliftName: string; }

export function MarkAvailableDialog({ open, onOpenChange, forkliftId, forkliftName }: MarkAvailableDialogProps) {
  const updateStatus = useUpdateStatus();
  const handleConfirm = () => {
    updateStatus.mutate(
      { forkliftId, fromStatus: "maintenance", toStatus: "available", note: "Mantenimiento completado" },
      { onSuccess: () => { toast.success(`${forkliftName} marcado como disponible`); onOpenChange(false); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-status-available" />¿Marcar como Disponible?</DialogTitle>
          <DialogDescription>{forkliftName} está actualmente en mantenimiento. ¿Marcarlo como disponible?</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Todavía No</Button>
          <Button onClick={handleConfirm} disabled={updateStatus.isPending}>{updateStatus.isPending ? "Actualizando..." : "Marcar Disponible"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
