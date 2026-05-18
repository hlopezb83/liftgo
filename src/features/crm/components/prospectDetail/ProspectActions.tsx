import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RoleGuard } from "@/layouts/RoleGuard";
import { Pencil, Trash2, Trophy, XCircle, RotateCcw } from "lucide-react";
import { useDeleteProspect, useUpdateProspect, type Prospect } from "@/hooks/useProspects";
import { useProspectGuard } from "@/features/crm/hooks/useProspectGuard";
import { CloseWonDialog } from "../CloseWonDialog";
import { CloseLostDialog } from "../CloseLostDialog";

interface Props {
  prospect: Prospect;
  onEdit: () => void;
  onClose: () => void;
}

export function ProspectActions({ prospect, onEdit, onClose }: Props) {
  const deleteProspect = useDeleteProspect();
  const updateProspect = useUpdateProspect();
  const { canCloseDeal, assertCanClose } = useProspectGuard();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wonOpen, setWonOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);

  const isClosed = prospect.stage === "cerrado_ganado" || prospect.stage === "cerrado_perdido";

  const handleDelete = () => {
    deleteProspect.mutate(prospect.id, { onSuccess: onClose });
  };

  const handleReopen = () => {
    updateProspect.mutate(
      { id: prospect.id, stage: "negociacion" },
      { onSuccess: onClose }
    );
  };

  return (
    <RoleGuard module="CRM / Prospectos" minAccess="full">
      <div className="space-y-2">
        {!isClosed && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => { if (assertCanClose("save")) setWonOpen(true); }}
              className="bg-success hover:bg-success/90 text-success-foreground"
              disabled={!canCloseDeal}
            >
              <Trophy className="h-4 w-4 mr-1" /> Ganado
            </Button>
            <Button variant="destructive" onClick={() => setLostOpen(true)}>
              <XCircle className="h-4 w-4 mr-1" /> Perdido
            </Button>
          </div>
        )}
        {isClosed && (
          <Button variant="outline" className="w-full" onClick={handleReopen} disabled={updateProspect.isPending}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reabrir deal
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { onEdit(); onClose(); }}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="flex-1 text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar prospecto?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción no se puede deshacer. Se eliminará permanentemente el prospecto "{prospect.company_name}".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleteProspect.isPending}>
                  {deleteProspect.isPending ? "Eliminando..." : "Eliminar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <CloseWonDialog
        prospect={prospect}
        open={wonOpen}
        onOpenChange={setWonOpen}
        isPending={updateProspect.isPending}
        onConfirm={(payload) => {
          updateProspect.mutate(
            { id: prospect.id, stage: "cerrado_ganado", ...payload },
            { onSuccess: () => { setWonOpen(false); onClose(); } }
          );
        }}
      />

      <CloseLostDialog
        prospect={prospect}
        open={lostOpen}
        onOpenChange={setLostOpen}
        isPending={updateProspect.isPending}
        onConfirm={(payload) => {
          updateProspect.mutate(
            { id: prospect.id, stage: "cerrado_perdido", ...payload },
            { onSuccess: () => { setLostOpen(false); onClose(); } }
          );
        }}
      />
    </RoleGuard>
  );
}
