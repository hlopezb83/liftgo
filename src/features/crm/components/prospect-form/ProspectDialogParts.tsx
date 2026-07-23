import { FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProspectStageBadge } from "./ProspectStageBadge";
import type { Prospect } from "../../hooks/useProspects";

export function ProspectStageBadgeBlock({
  prospect, overrideStage,
}: { prospect?: Prospect | null; overrideStage?: string }) {
  if (!overrideStage || !prospect) return null;
  return <ProspectStageBadge fromStage={prospect.stage} toStage={overrideStage} />;
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
  isPending?: boolean;
}

export function ProspectDialogFooter({ isClosingWonBlocked, onCancel, onDelete, isPending = false }: FooterProps) {
  return (
    <FormDialogFooter className="flex justify-between sm:justify-between">
      {onDelete && (
        <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => { onDelete(); onCancel(); }}>
          Eliminar
        </Button>
      )}
      <div className="flex gap-2 ml-auto">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Cancelar</Button>
        <Button type="submit" disabled={isClosingWonBlocked || isPending}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </FormDialogFooter>
  );
}
