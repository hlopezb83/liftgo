import { useState } from "react";
import { EditIcon, DeleteIcon, TrophyIcon, ErrorIcon, ResetIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RoleGuard } from "@/layouts/RoleGuard";
import { useProspectGuard } from "../../hooks/useProspectGuard";
import { useDeleteProspect, useUpdateProspect, type Prospect } from "../../hooks/useProspects";
import { CloseLostDialog } from "../CloseLostDialog";
import { CloseWonDialog } from "../CloseWonDialog";

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              onClick={() => { if (assertCanClose("save")) setWonOpen(true); }}
              className="bg-success hover:bg-success/90 text-success-foreground"
              disabled={!canCloseDeal}
            >
              <TrophyIcon className="h-4 w-4 mr-1" /> Ganado
            </Button>
            <Button variant="destructive" onClick={() => setLostOpen(true)}>
              <ErrorIcon className="h-4 w-4 mr-1" /> Perdido
            </Button>
          </div>
        )}
        {isClosed && (
          <Button variant="outline" className="w-full" onClick={handleReopen} disabled={updateProspect.isPending}>
            <ResetIcon className="h-4 w-4 mr-1" /> Reabrir deal
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { onEdit(); onClose(); }}>
            <EditIcon className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="ghost" className="flex-1 text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
            <DeleteIcon className="h-4 w-4 mr-1" /> Eliminar
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="¿Eliminar prospecto?"
            description={`Esta acción no se puede deshacer. Se eliminará permanentemente el prospecto "${prospect.companyName}".`}
            confirmLabel="Eliminar"
            destructive
            loading={deleteProspect.isPending}
            onConfirm={handleDelete}
          />
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
