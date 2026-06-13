import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProspectStageBadge } from "./ProspectStageBadge";
import type { Prospect } from "../../hooks/useProspects";

export function ProspectDialogHeader({
  prospect, overrideStage,
}: { prospect?: Prospect | null; overrideStage?: string }) {
  const title = prospect ? "Editar Prospecto" : "Nuevo Prospecto";
  const description = overrideStage && prospect
    ? "Confirma los datos antes de mover el prospecto de etapa."
    : prospect
      ? "Actualiza la información del prospecto."
      : "Agrega un nuevo prospecto al pipeline.";
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      {overrideStage && prospect && (
        <ProspectStageBadge fromStage={prospect.stage} toStage={overrideStage} />
      )}
    </DialogHeader>
  );
}

export function ProspectCreatorBlock({ createdByName }: { createdByName?: string | null }) {
  if (!createdByName) return null;
  return (
    <div className="space-y-1">
      <Label className="text-muted-foreground">Creado por</Label>
      <p className="text-sm font-medium">{createdByName}</p>
    </div>
  );
}

interface FooterProps {
  isClosingWonBlocked: boolean;
  onCancel: () => void;
  onDelete?: () => void;
}

export function ProspectDialogFooter({ isClosingWonBlocked, onCancel, onDelete }: FooterProps) {
  return (
    <DialogFooter className="flex justify-between sm:justify-between pt-4">
      {onDelete && (
        <Button type="button" variant="destructive" size="sm" onClick={() => { onDelete(); onCancel(); }}>
          Eliminar
        </Button>
      )}
      <div className="flex gap-2 ml-auto">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isClosingWonBlocked}>Guardar</Button>
      </div>
    </DialogFooter>
  );
}
